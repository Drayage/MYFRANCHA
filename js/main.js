// main.js — 부트스트랩, 시작 화면, 모드/토글 선택, 리플레이 진입, 온라인 로비
import { createState } from './state.js';
import { runGame } from './engine.js';
import * as ui from './ui.js';
import { showHelp, showCoachmarks } from './onboarding.js';
import { createRecorder, saveReplay, loadReplay, hasReplay, play as playReplay } from './replay.js';
import * as audio from './audio.js';
import * as online from './online.js';
import * as persistence from './persistence.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { $('screen-start').classList.toggle('hidden', id !== 'start'); $('screen-game').classList.toggle('hidden', id !== 'game'); };
const ONLINE_GUEST_KEY = 'francha.onlineGuest';

function withClickSfx(el, fn) {
  el.onclick = () => { audio.sfx('button'); fn(); };
}

function readOptions() {
  return {
    abilitiesEnabled: $('toggle-abilities').checked,
    expansionEnabled: $('toggle-expansion').checked,
    theaterEnabled: $('toggle-theater').checked,
  };
}

async function startGame(mode) {
  const opts = readOptions();
  const state = createState({ mode, ...opts });
  show('game');
  ui.buildBoard(state);
  ui.updateHUD(state);
  if ($('toggle-tutorial').checked) await showCoachmarks();

  // 실제 이번 판에서 뽑힌 상표 구성을 그대로 기록 — 확장 모드는 매판 랜덤이라
  // 리플레이 때 새로 뽑으면 tmId가 안 맞아 상표가 안 움직이는 버그가 생김.
  const trademarks = state.trademarks.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, ability: t.ability }));
  const recorder = createRecorder({ mode, ...opts, trademarks });
  await playOut(state, recorder, null);
}

// 새로고침 등으로 중단된 판이 있으면 저장된 지점(라운드/세트 경계)부터 이어한다.
// (온라인 호스트도 이 경로로 이어짐 — state.mode/roomId가 그대로 저장되어 있어 재개 시
// engine.js가 자동으로 온라인 동기화를 다시 시작한다.)
async function resumeGame() {
  const saved = persistence.loadCheckpoint();
  if (!saved) return;
  show('game');
  const trademarks = saved.trademarks.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, ability: t.ability }));
  const recorder = createRecorder({
    mode: saved.mode, abilitiesEnabled: saved.abilitiesEnabled,
    expansionEnabled: saved.expansionEnabled, theaterEnabled: saved.theaterEnabled, trademarks,
  });
  await playOut(saved, recorder, saved);
}

async function playOut(state, recorder, resume) {
  const result = await runGame(state, recorder, resume);
  saveReplay(recorder, result);
  refreshReplayButton();
  const outcome = personalizedOutcome(state, result);
  audio.sfx(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'round');

  ui.showGameOver(state, result, {
    onReplay: () => runReplay(loadReplay()),
    onHome: () => goHome(),
  });
}

// AI/온라인 대전은 내(humanSide) 기준 승/패, 로컬은 승자가 있으면 그냥 축하 사운드
function personalizedOutcome(state, result) {
  if (!result.winner) return 'draw';
  if (state.mode === 'ai' || state.mode === 'online') return result.winner === state.humanSide ? 'win' : 'lose';
  return 'win';
}

async function runReplay(recording) {
  if (!recording) return;
  // 리플레이용 상태(보드 구성만 필요). 실제 판에서 쓰인 상표 구성을 그대로 복원해야
  // 기록된 tmId와 보드의 토큰이 일치해서 이동 애니메이션이 재생된다.
  const state = createState({ mode: recording.meta.mode, ...recording.meta });
  if (recording.meta.trademarks) {
    state.trademarks = recording.meta.trademarks.map((t) => ({ ...t, owner: 'center' }));
  }
  show('game');
  ui.buildBoard(state);
  ui.updateHUD(state);
  ui.setBanner('▶ 리플레이 재생 중');
  await playReplay(recording, {
    resetBoard: () => ui.resetTokensToCenter(state),
    onCaption: (txt) => ui.setBanner(txt || '리플레이'),
  });
  // 재생 후 홈으로
  goHome();
}

function goHome() {
  ui.closeModal();
  show('start');
  refreshReplayButton();
  refreshContinueButton();
  refreshOnlineRejoinButton();
}

// 게임 화면 상단 🏠 버튼 전용: 진행 중인 판을 사람이 직접 나가기로 한 것이므로(새로고침과
// 달리) 이어하기 대상에서 제외한다. (goHome은 게임 종료 후/리플레이 후에도 불리므로 여기서만 지움 —
// 안 그러면 아직 이어하지 않은 저장된 판을 리플레이만 보고 나가도 지워지는 버그가 생김)
function abandonGame() {
  stopWatchingOnline();
  localStorage.removeItem(ONLINE_GUEST_KEY);
  persistence.clearCheckpoint();
  goHome();
}

function refreshReplayButton() {
  $('btn-replay-last').classList.toggle('hidden', !hasReplay());
}

function refreshContinueButton() {
  $('btn-continue').classList.toggle('hidden', !persistence.hasCheckpoint());
}

function refreshOnlineRejoinButton() {
  $('btn-online-rejoin').classList.toggle('hidden', !localStorage.getItem(ONLINE_GUEST_KEY));
}

function syncMuteButtons() {
  const on = audio.isBgmEnabled() || audio.isSfxEnabled();
  const icon = on ? '🔊' : '🔇';
  $('btn-mute').textContent = icon;
  $('btn-mute-game').textContent = icon;
}
function toggleMute() {
  const on = !(audio.isBgmEnabled() || audio.isSfxEnabled());
  audio.setBgmEnabled(on);
  audio.setSfxEnabled(on);
  syncMuteButtons();
  if (on) audio.sfx('button');
}

// ── 온라인 대전: 로비(방 만들기/참가) + 게스트 구동 루프 ──
// 호스트는 engine.js가 로컬에서 그대로 게임을 돌리고(오프라인과 동일 코드 경로), 온라인일 때만
// 상대 쪽 입력을 AI 대신 Firebase 왕복 요청으로 받는다(engine.js의 isRemote 분기).
// 게스트는 별도 엔진 루프 없이, 동기화된 state 스냅샷을 그대로 그리기만 하는 얇은 뷰어 +
// 자기 차례에 request가 오면 로컬 UI(오프라인과 같은 ui.selectCards 등)로 답을 모아 보낸다.
let onlineCleanup = null; // 게스트 구독 해제 함수(있을 때만)

function stopWatchingOnline() {
  if (onlineCleanup) { onlineCleanup(); onlineCleanup = null; }
}

function promptText(title, placeholder, defaultValue = '') {
  return new Promise((resolve) => {
    ui.openModal(`
      <h3>${title}</h3>
      <input id="pt-input" type="text" placeholder="${placeholder}" value="${defaultValue}"
        style="width:100%;padding:10px;border-radius:8px;border:none;font:inherit;margin:10px 0 4px;box-sizing:border-box;text-align:center;" />
      <div class="modal-choices">
        <button class="modal-choice" id="pt-ok">확인</button>
        <button class="modal-choice" id="pt-cancel">취소</button>
      </div>`, (root) => {
      const input = root.querySelector('#pt-input');
      input.focus();
      input.select();
      const submit = () => { const v = input.value.trim(); ui.closeModal(); resolve(v || null); };
      root.querySelector('#pt-ok').onclick = submit;
      root.querySelector('#pt-cancel').onclick = () => { ui.closeModal(); resolve(null); };
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  });
}

function infoModal(title, body) {
  ui.openModal(`<h3>${title}</h3><p style="color:var(--muted);font-size:.9rem;line-height:1.5;">${body}</p>
    <div class="modal-choices"><button class="modal-choice" data-act="close">확인</button></div>`,
    (root) => { root.querySelector('[data-act="close"]').onclick = () => ui.closeModal(); });
}

async function openOnlineMenu() {
  if (!online.isOnlineConfigured()) {
    infoModal('🌐 온라인 대전 (준비중)', '아직 온라인 서버 키가 설정되지 않았습니다.<br/>지금은 🤖 AI 대전과 👥 로컬 패스앤플레이로 즐겨주세요!');
    return;
  }
  ui.openModal(`
    <h3>🌐 온라인 대전</h3>
    <p style="color:var(--muted);font-size:.85rem;">같은 링크를 여는 상대와 방 코드로 연결됩니다.</p>
    <div class="modal-choices">
      <button class="modal-choice" id="online-host">🏠 방 만들기</button>
      <button class="modal-choice" id="online-join">🔑 방 참가</button>
    </div>`, (root) => {
    root.querySelector('#online-host').onclick = () => { ui.closeModal(); hostOnlineGame(); };
    root.querySelector('#online-join').onclick = () => { ui.closeModal(); joinOnlineGame(); };
  });
}

// 방 만들기: 이름 입력 → 방 생성 → 게스트 대기 로비 → 시작
async function hostOnlineGame() {
  const hostName = await promptText('내 이름 (갑)', '이름을 입력하세요', '갑');
  if (!hostName) return;
  const opts = readOptions();
  let roomId;
  try {
    roomId = await online.createRoom(hostName, opts);
  } catch (e) {
    infoModal('방 생성 실패', e.message);
    return;
  }
  const joined = await waitForGuest(roomId);
  if (!joined) { online.leaveRoom(roomId); return; }

  const state = createState({ mode: 'online', ...opts });
  state.humanSide = 'A'; // 방장은 항상 갑
  state.roomId = roomId;
  show('game');
  await online.markPlaying(roomId);
  const trademarks = state.trademarks.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, ability: t.ability }));
  const recorder = createRecorder({ mode: 'online', ...opts, trademarks });
  await playOut(state, recorder, null);
}

// 게스트가 들어올 때까지 방 코드를 보여주며 대기(room 구독으로 실시간 반영).
function waitForGuest(roomId) {
  return new Promise((resolve) => {
    let unsub = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (unsub) unsub();
      resolve(result);
    };
    online.subscribeRoom(roomId, (room) => {
      if (!room || settled) return;
      const guestName = room.players.B;
      ui.openModal(`
        <h3>🌐 방 코드</h3>
        <p style="font-size:2.1rem;font-weight:900;letter-spacing:.15em;text-align:center;color:var(--gold);margin:8px 0;">${roomId}</p>
        <p style="color:var(--muted);font-size:.85rem;text-align:center;">이 코드를 상대에게 알려주세요.</p>
        <p style="text-align:center;font-weight:700;">${guestName ? `✅ ${guestName} 님 입장!` : '⏳ 상대를 기다리는 중…'}</p>
        <div class="modal-choices">
          <button class="modal-choice" id="online-start" ${guestName ? '' : 'disabled'}>게임 시작</button>
          <button class="modal-choice" id="online-cancel">취소</button>
        </div>`, (root) => {
        root.querySelector('#online-cancel').onclick = () => { ui.closeModal(); finish(false); };
        const startBtn = root.querySelector('#online-start');
        if (guestName) startBtn.onclick = () => { ui.closeModal(); finish(true); };
      });
    }).then((u) => { unsub = u; });
  });
}

// 방 참가: 코드+이름 입력 → 참가 → 게스트 구동 루프 진입.
async function joinOnlineGame() {
  if (!online.isOnlineConfigured()) {
    infoModal('🌐 온라인 대전 (준비중)', '아직 온라인 서버 키가 설정되지 않았습니다.');
    return;
  }
  const roomIdRaw = await promptText('방 코드 입력', '예: AB3XZ');
  if (!roomIdRaw) return;
  const roomId = roomIdRaw.trim().toUpperCase();
  const guestName = await promptText('내 이름 (을)', '이름을 입력하세요', '을');
  if (!guestName) return;
  try {
    await online.joinRoom(roomId, guestName);
  } catch (e) {
    infoModal('참가 실패', e.message);
    return;
  }
  localStorage.setItem(ONLINE_GUEST_KEY, JSON.stringify({ roomId, guestName }));
  refreshOnlineRejoinButton();
  await watchOnlineAsGuest(roomId);
}

// 새로고침으로 끊긴 게스트가 같은 방에 다시 들어간다(참가 절차 없이 바로 구독).
async function rejoinOnlineGame() {
  const saved = JSON.parse(localStorage.getItem(ONLINE_GUEST_KEY) || 'null');
  if (!saved) return;
  await watchOnlineAsGuest(saved.roomId);
}

// 게스트 구동 루프: state 스냅샷을 그대로 그리기만 하고(움직임 애니메이션은 재현하지 않음 —
// 온라인 1단계 범위), 자기 차례 request가 오면 오프라인과 같은 ui 선택 함수로 답을 모아 보낸다.
async function watchOnlineAsGuest(roomId) {
  show('game');
  ui.setBanner('⏳ 호스트가 게임을 시작하길 기다리는 중…');
  let currentState = null;
  let gameOverShown = false;

  const unsubState = await online.subscribeRoom(roomId, (room) => {
    if (!room) {
      ui.showToast('⚠️ 방이 사라졌습니다(호스트가 나갔을 수 있어요).', 3000);
      return;
    }
    if (room.state) {
      currentState = { ...room.state, humanSide: 'B' }; // 내(게스트) 관점으로 라벨링
      ui.buildBoard(currentState);
      ui.updateHUD(currentState);
    }
    if (room.status === 'done' && room.result && !gameOverShown && currentState) {
      gameOverShown = true;
      ui.showGameOver(currentState, room.result, {
        onReplay: () => ui.showToast('온라인 대전은 리플레이를 지원하지 않습니다.'),
        onHome: () => { stopWatchingOnline(); localStorage.removeItem(ONLINE_GUEST_KEY); goHome(); },
      });
    }
  });

  const unsubReq = await online.subscribeRequest(roomId, async (req) => {
    if (req.player !== 'B') return;
    // 요청 시점 상태를 한 번 더 직접 읽어와 구독 지연으로 인한 손패 불일치를 방지.
    const fresh = await online.getRoomState(roomId);
    const state = { ...(fresh || currentState), humanSide: 'B' };
    let answer = null;
    if (req.kind === 'cards') {
      const chosen = await ui.selectCards(state, 'B', req.size, { peekInfo: req.peek });
      answer = { uids: chosen.map((c) => c.uid) };
    } else if (req.kind === 'target') {
      const valid = state.trademarks.filter((t) => req.validIds.includes(t.id));
      const target = await ui.selectTrademark(valid, `${req.cardName}: 대상 선택`);
      answer = { tmId: target.id };
    } else if (req.kind === 'renownedClaim') {
      const claimed = await ui.selectRenownedClaim(state.trademarks, '상표를 클릭해 능력을 확인한 뒤 "이걸로 선택"을 누르세요');
      answer = { tmId: claimed.id };
    }
    if (answer) await online.answerRequest(roomId, req.id, answer);
  });

  onlineCleanup = () => { unsubState(); unsubReq(); };
}

function init() {
  withClickSfx($('btn-ai'), () => startGame('ai'));
  withClickSfx($('btn-local'), () => startGame('local'));
  withClickSfx($('btn-online'), () => openOnlineMenu());
  withClickSfx($('btn-help'), showHelp);
  withClickSfx($('btn-help-game'), showHelp);
  withClickSfx($('btn-coach'), () => showCoachmarks());
  withClickSfx($('btn-home'), abandonGame);
  withClickSfx($('btn-replay-last'), () => runReplay(loadReplay()));
  withClickSfx($('btn-continue'), resumeGame);
  withClickSfx($('btn-online-rejoin'), rejoinOnlineGame);
  $('btn-mute').onclick = toggleMute;
  $('btn-mute-game').onclick = toggleMute;
  syncMuteButtons();
  refreshReplayButton();
  refreshContinueButton();
  refreshOnlineRejoinButton();

  audio.startBgm();

  // PWA 서비스워커 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
