// main.js — 부트스트랩, 시작 화면, 모드/토글 선택, 리플레이 진입
import { createState } from './state.js';
import { runGame } from './engine.js';
import * as ui from './ui.js';
import { showHelp, showCoachmarks } from './onboarding.js';
import { createRecorder, saveReplay, loadReplay, hasReplay, play as playReplay } from './replay.js';
import * as audio from './audio.js';
import { isOnlineConfigured, showOnlineComingSoon } from './online.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { $('screen-start').classList.toggle('hidden', id !== 'start'); $('screen-game').classList.toggle('hidden', id !== 'game'); };

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
  const result = await runGame(state, recorder);
  saveReplay(recorder, result);
  refreshReplayButton();
  const outcome = personalizedOutcome(state, result);
  audio.sfx(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'round');

  ui.showGameOver(state, result, {
    onReplay: () => runReplay(loadReplay()),
    onHome: () => goHome(),
  });
}

// AI 대전은 내(humanSide) 기준 승/패, 로컬은 승자가 있으면 그냥 축하 사운드
function personalizedOutcome(state, result) {
  if (!result.winner) return 'draw';
  if (state.mode === 'ai') return result.winner === state.humanSide ? 'win' : 'lose';
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
}

function refreshReplayButton() {
  $('btn-replay-last').classList.toggle('hidden', !hasReplay());
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

function init() {
  withClickSfx($('btn-ai'), () => startGame('ai'));
  withClickSfx($('btn-local'), () => startGame('local'));
  withClickSfx($('btn-online'), () => showOnlineComingSoon());
  withClickSfx($('btn-help'), showHelp);
  withClickSfx($('btn-help-game'), showHelp);
  withClickSfx($('btn-coach'), () => showCoachmarks());
  withClickSfx($('btn-home'), goHome);
  withClickSfx($('btn-replay-last'), () => runReplay(loadReplay()));
  $('btn-mute').onclick = toggleMute;
  $('btn-mute-game').onclick = toggleMute;
  syncMuteButtons();
  refreshReplayButton();
  $('btn-online').classList.toggle('hidden', false); // 항상 노출(클릭 시 안내), 준비되면 isOnlineConfigured()로 분기 가능

  audio.startBgm();

  // PWA 서비스워커 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
