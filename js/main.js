// main.js — 부트스트랩, 시작 화면, 모드/토글 선택, 리플레이 진입
import { createState } from './state.js';
import { runGame } from './engine.js';
import * as ui from './ui.js';
import { showHelp, showCoachmarks } from './onboarding.js';
import { createRecorder, saveReplay, loadReplay, hasReplay, play as playReplay } from './replay.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { $('screen-start').classList.toggle('hidden', id !== 'start'); $('screen-game').classList.toggle('hidden', id !== 'game'); };

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

  ui.showGameOver(state, result, {
    onReplay: () => runReplay(loadReplay()),
    onHome: () => goHome(),
  });
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

function init() {
  $('btn-ai').onclick = () => startGame('ai');
  $('btn-local').onclick = () => startGame('local');
  $('btn-help').onclick = showHelp;
  $('btn-help-game').onclick = showHelp;
  $('btn-coach').onclick = () => showCoachmarks();
  $('btn-home').onclick = goHome;
  $('btn-replay-last').onclick = () => runReplay(loadReplay());
  refreshReplayButton();

  // PWA 서비스워커 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
