// replay.js — 리플레이 기록 + 재생(애니메이션 엔진 재사용)
import { move, setAnimSpeed, sleep } from './animation.js';
import { PLAYER_LABEL } from './config.js';

const STORE_KEY = 'francha.lastReplay';

// 기록기: 게임 진행 중 의미 이벤트를 모은다.
export function createRecorder(meta) {
  return {
    meta,                 // { abilitiesEnabled, theaterEnabled, mode, trademarks }
    events: [],           // 순차 이벤트
    add(ev) { this.events.push(ev); },
  };
}

// 한 판 종료 후 localStorage에 저장
export function saveReplay(recorder, result) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      meta: recorder.meta, events: recorder.events, result, savedAt: Date.now(),
    }));
  } catch (e) { /* 저장 실패는 무시 */ }
}

export function loadReplay() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function hasReplay() { return !!loadReplay(); }

// 재생 컨트롤 상태
let ctrl = null;

// recording을 재생한다. resetBoard()는 상표 토큰을 모두 중앙으로 되돌리는 콜백.
export async function play(recording, { resetBoard, onCaption }) {
  resetBoard();
  const moves = recording.events.filter((e) => e.kind === 'move' || e.kind === 'nullify');
  ctrl = { paused: false, step: false, speed: 1, idx: 0, abort: false };
  buildControls(moves.length);

  for (let i = 0; i < moves.length && !ctrl.abort; i++) {
    ctrl.idx = i;
    updateProgress(i + 1, moves.length);
    // 일시정지/스텝 대기
    while ((ctrl.paused && !ctrl.step) && !ctrl.abort) await sleep(80);
    ctrl.step = false;
    if (ctrl.abort) break;

    const ev = moves[i];
    setAnimSpeed(ctrl.speed);
    if (ev.kind === 'move') {
      onCaption?.(captionFor(ev));
      await move(ev.tmId, ev.toOwner, { collision: !!ev.collision });
    } else if (ev.kind === 'nullify') {
      onCaption?.(`${PLAYER_LABEL[ev.actor]}가 소송뭉개기로 ${PLAYER_LABEL[ev.victim]}의 카드를 무효화!`);
      await sleep(700);
    }
    await sleep(250);
  }
  setAnimSpeed(1);
  onCaption?.(ctrl.abort ? '' : '리플레이 종료');
  removeControls();
}

function captionFor(ev) {
  const c = { apply: '출원', prove: '사실관계증명', cancel: '불사용취소심판' }[ev.cardType] || '';
  return `R${ev.round} · ${PLAYER_LABEL[ev.actor]}: ${c}`;
}

function buildControls(total) {
  removeControls();
  const bar = document.createElement('div');
  bar.id = 'replay-bar';
  bar.innerHTML = `
    <button id="rp-toggle" class="rp-btn">⏸</button>
    <button id="rp-step" class="rp-btn">⏭</button>
    <span id="rp-progress" class="rp-progress">0 / ${total}</span>
    <label class="rp-speed">속도
      <select id="rp-speed">
        <option value="0.5">0.5x</option>
        <option value="1" selected>1x</option>
        <option value="2">2x</option>
        <option value="4">4x</option>
      </select>
    </label>
    <button id="rp-exit" class="rp-btn rp-exit">나가기</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#rp-toggle').onclick = (e) => {
    ctrl.paused = !ctrl.paused;
    e.target.textContent = ctrl.paused ? '▶' : '⏸';
  };
  bar.querySelector('#rp-step').onclick = () => { ctrl.step = true; };
  bar.querySelector('#rp-speed').onchange = (e) => { ctrl.speed = parseFloat(e.target.value); };
  bar.querySelector('#rp-exit').onclick = () => { ctrl.abort = true; };
}
function updateProgress(cur, total) {
  const el = document.getElementById('rp-progress');
  if (el) el.textContent = `${cur} / ${total}`;
}
function removeControls() {
  document.getElementById('replay-bar')?.remove();
}
