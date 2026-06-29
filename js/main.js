// main.js — 부트스트랩, 시작 화면, 모드/토글 선택, 리플레이 진입
import { createState } from './state.js';
import { runGame } from './engine.js';
import * as ui from './ui.js';
import { showHelp, maybeShowCoachmarks } from './onboarding.js';
import { createRecorder, saveReplay, loadReplay, hasReplay, play as playReplay } from './replay.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { $('screen-start').classList.toggle('hidden', id !== 'start'); $('screen-game').classList.toggle('hidden', id !== 'game'); };

function readOptions() {
  return {
    abilitiesEnabled: $('toggle-abilities').checked,
    theaterEnabled: $('toggle-theater').checked,
  };
}

async function startGame(mode) {
  const opts = readOptions();
  const state = createState({ mode, ...opts });
  show('game');
  ui.buildBoard(state);
  ui.updateHUD(state);
  await maybeShowCoachmarks();

  const recorder = createRecorder({ mode, ...opts });
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
  // 리플레이용 상태(보드 구성만 필요)
  const state = createState({ mode: recording.meta.mode, ...recording.meta });
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
  $('btn-coach').onclick = () => maybeShowCoachmarks(true);
  $('btn-home').onclick = goHome;
  $('btn-replay-last').onclick = () => runReplay(loadReplay());
  refreshReplayButton();

  // PWA 서비스워커 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
