// engine.js — 라운드/페이즈 진행 상태기계 + 카드 해결 파이프라인
import { TOTAL_ROUNDS, SET_SIZES, PLAYER_LABEL, OWNER } from './config.js';
import {
  dealHand, opponentOf, applyMove, checkInstantWin,
  evaluateRoundToken, finalResult, countOwned,
} from './state.js';
import { CARD_BEHAVIOR } from './cards.js';
import { burgerKeepsToken, coffeePeek } from './abilities.js';
import * as ai from './ai.js';
import * as ui from './ui.js';
import * as theater from './theater.js';
import { move, shakeToken, sleep } from './animation.js';

const isHuman = (state, player) => state.mode === 'local' || player === 'A';
const describe = (cards) => cards.map((c) => c.name).join(', ');

// 게임 1판 실행. recorder에 이벤트를 기록한다.
export async function runGame(state, recorder) {
  ui.buildBoard(state);
  ui.updateHUD(state);

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    state.round = round;
    state.roundSecuredTwo = null;
    state.hands.A = dealHand();
    state.hands.B = dealHand();
    ui.updateHUD(state);

    for (let s = 0; s < SET_SIZES.length; s++) {
      state.setIndex = s;
      ui.updateHUD(state);
      const size = SET_SIZES[s];
      ui.setBanner(`라운드 ${round} · ${['1차','2차','3차'][s]}(${size}장) — 선플레이어 ${PLAYER_LABEL[state.firstPlayer]}`);

      const submissions = await collectSubmissions(state, size);
      const ended = await resolveSet(state, submissions, size, recorder);
      if (ended) { state.phase = 'game-over'; return endGame(state, recorder, { reason: 'instant', winner: state.winner }); }

      // 세트 종료 → 선플레이어 토큰 교대(햄부기퀸이면 유지)
      if (!burgerKeepsToken(state)) {
        state.firstPlayer = opponentOf(state.firstPlayer);
      } else {
        ui.showToast(`🍔 햄부기퀸 효과: ${PLAYER_LABEL[state.firstPlayer]}가 선플레이어 토큰 유지`);
      }
      ui.updateHUD(state);
      await sleep(300);
    }

    state.phase = 'round-end';
    await ui.showRoundEnd(state);
  }

  // 5라운드 종료 판정
  const result = finalResult(state);
  state.winner = result.winner;
  state.phase = 'game-over';
  return endGame(state, recorder, result);
}

// ── 제출 수집 ──
async function collectSubmissions(state, size) {
  // 맹한커피 미리보기: peek 보유 플레이어를 마지막에 제출시킨다.
  let order = ['A', 'B'];
  if (coffeePeek(state, 'A')) order = ['B', 'A'];
  else if (coffeePeek(state, 'B')) order = ['A', 'B'];

  const result = {};
  for (const player of order) {
    const peek = coffeePeek(state, player) && result[opponentOf(player)]
      ? describe(result[opponentOf(player)]) : null;
    result[player] = await getSubmission(state, player, size, peek);
  }
  return result;
}

async function getSubmission(state, player, size, peek) {
  let chosen;
  if (isHuman(state, player)) {
    if (state.mode === 'local') await ui.showCover(player);
    chosen = await ui.selectCards(state, player, size, { peekInfo: peek });
  } else {
    ui.setBanner(`🤖 ${PLAYER_LABEL[player]}(AI) 카드 제출 중…`);
    await sleep(500);
    chosen = ai.chooseSubmission(state, player, size);
  }
  // 손패에서 제거
  const uids = new Set(chosen.map((c) => c.uid));
  state.hands[player] = state.hands[player].filter((c) => !uids.has(c.uid));
  return chosen.map((card) => ({ card, owner: player, resolved: false, nullified: false }));
}

// ── 세트 해결 ──
// size 1: 선플→후플. size 2: 선플/후플 번갈아 1장씩.
function buildOrder(firstPlayer, size) {
  const second = opponentOf(firstPlayer);
  const order = [];
  for (let i = 0; i < size; i++) { order.push([firstPlayer, i]); order.push([second, i]); }
  return order;
}

async function resolveSet(state, submissions, size, recorder) {
  const slots = { A: submissions.A, B: submissions.B };
  const order = buildOrder(state.firstPlayer, size);

  for (const [player, idx] of order) {
    const slot = slots[player][idx];
    if (!slot) continue;
    slot.resolved = true;
    const win = await resolveCard(state, player, slot, slots, recorder);
    ui.updateHUD(state);
    if (win) { state.winner = win; return true; }

    const tokGot = evaluateRoundToken(state);
    if (tokGot) {
      recorder.add({ kind: 'round-token', round: state.round, actor: tokGot });
      state.log.push({ kind: 'round-token', actor: tokGot, round: state.round });
      ui.showToast(`🏁 ${PLAYER_LABEL[tokGot]}가 상표 2개 선확보 — 라운드 토큰 획득!`, 2200);
      await sleep(400);
    }
  }
  return false;
}

async function resolveCard(state, player, slot, slots, recorder) {
  const card = slot.card;
  const opp = opponentOf(player);

  if (slot.nullified) {
    ui.showToast(`🗂️ ${PLAYER_LABEL[player]}의 ${card.name}이(가) 무효화되어 불발!`);
    await sleep(500);
    return null;
  }

  // 소송뭉개기: 상표 이동 없음. 상대의 미처리 카드 1장 무효화.
  if (card.type === 'smother') {
    const pending = slots[opp].filter((s) => !s.resolved && !s.nullified);
    let pickIdx;
    if (isHuman(state, player)) {
      pickIdx = await ui.selectSmotherTarget(pending, `${PLAYER_LABEL[player]}(${player})`);
    } else {
      pickIdx = ai.chooseSmotherTarget(state, player, pending);
    }
    if (pickIdx == null || !pending[pickIdx]) {
      ui.showToast(`${PLAYER_LABEL[player]}: 소송뭉개기 — 무효화할 카드가 없습니다.`);
      await sleep(500);
      return null;
    }
    pending[pickIdx].nullified = true;
    recorder.add({ kind: 'nullify', round: state.round, actor: player, victim: opp });
    ui.showToast(`🗂️ ${PLAYER_LABEL[player]}가 소송뭉개기로 ${PLAYER_LABEL[opp]}의 카드를 무효화!`, 2000);
    await theater.say(state, { cardType: 'smother', actor: player, victim: opp });
    await sleep(300);
    return null;
  }

  // 상표 이동 카드
  const behavior = CARD_BEHAVIOR[card.type];
  const valid = behavior.validTargets(state, player);
  if (valid.length === 0) {
    ui.showToast(`${PLAYER_LABEL[player]}의 ${card.name} — 대상이 없어 불발!`);
    await sleep(500);
    return null;
  }

  let target;
  if (isHuman(state, player)) {
    target = await ui.selectTrademark(valid, `${PLAYER_LABEL[player]}(${player}) — ${card.name}: 대상 상표를 선택하세요`);
  } else {
    ui.setBanner(`🤖 ${PLAYER_LABEL[player]}(AI) — ${card.name} 처리 중…`);
    await sleep(450);
    target = ai.chooseTarget(state, player, card, valid);
  }

  const toOwner = behavior.toOwner(state, player);
  const collision = card.type === 'prove'; // 강제 뒤집기 = 충돌 연출
  const fromOwner = target.owner;

  await theater.say(state, { cardType: card.type, actor: player, victim: opp });
  await move(target.id, toOwner, { collision });
  applyMove(state, target.id, toOwner);

  recorder.add({
    kind: 'move', round: state.round, setIndex: state.setIndex,
    actor: player, cardType: card.type, tmId: target.id,
    fromOwner, toOwner, collision,
  });

  const destLabel = toOwner === OWNER.CENTER ? '중앙' : `${PLAYER_LABEL[toOwner]} 영역`;
  ui.showToast(`${PLAYER_LABEL[player]}: ${card.name} → ${target.name}을(를) ${destLabel}(으)로!`, 2000);
  await sleep(250);

  const winner = checkInstantWin(state);
  return winner;
}

function endGame(state, recorder, result) {
  ui.setBanner(result.winner ? `🏆 ${PLAYER_LABEL[result.winner]} 승리!` : '🤝 무승부');
  return result;
}

export { countOwned };
