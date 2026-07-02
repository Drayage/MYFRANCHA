// engine.js — 라운드/페이즈 진행 상태기계 + 카드 해결 파이프라인 (+ 능력 훅)
import { TOTAL_ROUNDS, SET_SIZES, PLAYER_LABEL, OWNER } from './config.js';
import {
  dealHand, opponentOf, applyMove, checkInstantWin,
  evaluateRoundToken, finalResult, countOwned,
} from './state.js';
import { CARD_BEHAVIOR } from './cards.js';
import * as ab from './abilities.js';
import * as ai from './ai.js';
import * as ui from './ui.js';
import * as theater from './theater.js';
import { move, sleep } from './animation.js';

const isHuman = (state, player) => state.mode === 'local' || player === state.humanSide;
const describe = (cards) => cards.map((c) => c.name).join(', ');
const MOVE_TYPES = ['apply', 'prove', 'cancel'];

// 게임 1판 실행. recorder에 이벤트를 기록한다.
export async function runGame(state, recorder) {
  ui.buildBoard(state);
  ui.updateHUD(state);

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    state.round = round;
    state.roundSecuredTwo = null;
    state.hands.A = dealHand();
    state.hands.B = dealHand();

    // 라운드 시작 능력(보호막/패 변환)
    const rs = ab.onRoundStart(state);
    if (rs.shield) { ui.flashAbility('pig'); ui.showToast(`🛡️ 화남돼지집: ${PLAYER_LABEL[rs.shield]} 보호막 획득`); }
    if (rs.daiso) { ui.flashAbility('daiso'); ui.showToast(`🔁 다없소: ${PLAYER_LABEL[rs.daiso]} 출원→소송뭉개기`); }
    ui.updateHUD(state);
    if (rs.shield || rs.daiso) await sleep(500);

    for (let s = 0; s < SET_SIZES.length; s++) {
      state.setIndex = s;
      ui.updateHUD(state);
      const size = SET_SIZES[s];
      ui.setBanner(`R${round} ${['1차','2차','3차'][s]}(${size}장) · 선플 ${PLAYER_LABEL[state.firstPlayer]}`);

      const submissions = await collectSubmissions(state, size);
      const ended = await resolveSet(state, submissions, size, recorder);
      if (ended) { state.phase = 'game-over'; return endGame(state, recorder, { reason: 'instant', winner: state.winner }); }

      // 세트 종료 → 선플레이어 토큰 교대(빨리바게뜨 보유자면 유지)
      if (!ab.keepsFirst(state)) {
        state.firstPlayer = opponentOf(state.firstPlayer);
      } else {
        ui.flashAbility('baguette');
        ui.showToast(`👑 빨리바게뜨: ${PLAYER_LABEL[state.firstPlayer]} 선 유지`);
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
  // 미리보기(peek) 능력자를 마지막에 제출시켜 상대 카드를 보게 한다.
  const peeker = ab.peekerFor(state);
  const order = peeker ? [ab.opp(peeker.player), peeker.player] : ['A', 'B'];

  const result = {};
  for (const player of order) {
    const canPeek = peeker && player === peeker.player && result[opponentOf(player)];
    const peek = canPeek ? describe(result[opponentOf(player)].map((s) => s.card)) : null;
    if (peek) ui.flashAbility(peeker.ability);
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
    ui.setBanner(`🤖 ${PLAYER_LABEL[player]}(AI) 제출 중…`);
    await sleep(500);
    chosen = ai.chooseSubmission(state, player, size);
  }
  const uids = new Set(chosen.map((c) => c.uid));
  state.hands[player] = state.hands[player].filter((c) => !uids.has(c.uid));
  return chosen.map((card) => ({ card, owner: player, resolved: false, nullified: false }));
}

// ── 세트 해결 ──
function buildOrder(firstPlayer, size) {
  const second = opponentOf(firstPlayer);
  const order = [];
  for (let i = 0; i < size; i++) { order.push([firstPlayer, i]); order.push([second, i]); }
  return order;
}

async function resolveSet(state, submissions, size, recorder) {
  const slots = { A: submissions.A, B: submissions.B };

  // 1) 처리 순서대로 뒷면 공개 → 왼쪽부터 순차 플립
  const order = buildOrder(state.firstPlayer, size);
  ui.showRevealArea(slots, order, state.firstPlayer);
  ui.setBanner(`R${state.round} ${['1차','2차','3차'][state.setIndex]} · 카드 공개!`);
  await sleep(650);
  await ui.flipRevealAll();
  await sleep(550);

  // 2) 같은 턴 무효화 선계산(면책이면 스킵). 소송뭉개기는 '사용됨' 표시.
  for (let i = 0; i < size; i++) {
    for (const p of ['A', 'B']) {
      const slot = slots[p][i];
      if (slot && slot.card.type === 'smother') {
        const victim = slots[opponentOf(p)][i];
        if (victim && !ab.isNullifyImmune(state, victim.owner)) {
          victim.nullified = true;
          ui.markRevealNullified(opponentOf(p), i);
        }
        ui.markRevealUsed(p, i);
      }
    }
  }
  await sleep(450);

  // 3) 턴(슬롯) 순서대로, 각 턴은 선플레이어 먼저 순차 처리
  for (const [player, idx] of order) {
    const slot = slots[player][idx];
    if (!slot) continue;
    slot.resolved = true;
    ui.highlightRevealCard(player, idx);
    const win = await resolveCard(state, player, slot, slots, idx, recorder);
    ui.updateHUD(state);
    if (win) { state.winner = win; ui.clearRevealArea(); return true; }

    const tokGot = evaluateRoundToken(state);
    if (tokGot) {
      recorder.add({ kind: 'round-token', round: state.round, actor: tokGot });
      state.log.push({ kind: 'round-token', actor: tokGot, round: state.round });
      ui.showToast(`🏁 ${PLAYER_LABEL[tokGot]} 라운드 토큰 획득!`, 2200);
      await sleep(400);
    }
  }
  ui.clearRevealArea();
  return false;
}

async function resolveCard(state, player, slot, slots, idx, recorder) {
  const card = slot.card;
  const opp = opponentOf(player);

  if (slot.nullified) {
    ui.showToast(`${PLAYER_LABEL[player]} ${card.name} 무효(불발)`);
    await sleep(500);
    return null;
  }

  // 소송뭉개기: 같은 턴 상대 카드 무효화(면책 반영은 (2)). 여기선 연출 + 던진도너츠 복사.
  if (card.type === 'smother') {
    const co = slots[opp][idx];
    if (co && ab.isNullifyImmune(state, co.owner)) {
      ui.flashAbility('toast');
      ui.showToast(`🛟 아삭토스트 면역: ${PLAYER_LABEL[player]} 소송뭉개기 실패`, 2000);
      await sleep(400);
      return null;
    }
    recorder.add({ kind: 'nullify', round: state.round, actor: player, victim: opp });
    ui.showToast(`🚫 ${PLAYER_LABEL[player]} 소송뭉개기: ${PLAYER_LABEL[opp]} 같은 턴 무효`, 2000);
    await theater.say(state, { cardType: 'smother', actor: player, victim: opp });
    await sleep(300);
    // 던진도너츠: 무효화한 상대 카드(이동 카드)의 효과를 복사
    if (ab.dunkinHolder(state) === player && co && MOVE_TYPES.includes(co.card.type)) {
      ui.flashAbility('dunkin');
      ui.showToast(`🍩 던진도너츠 역고소 카피: ${co.card.name} 효과 복사!`, 2000);
      await sleep(300);
      return performMove(state, player, co.card, recorder);
    }
    return null;
  }

  // 상표 이동 카드
  return performMove(state, player, card, recorder);
}

// 상표 이동 카드 처리(일반 + 던진도너츠 복사 공용). 승자 반환 or null.
async function performMove(state, player, card, recorder) {
  const opp = opponentOf(player);
  const behavior = CARD_BEHAVIOR[card.type];
  let valid = behavior.validTargets(state, player);
  valid = ab.modifyTargets(state, player, card, valid);
  if (valid.length === 0) {
    ui.showToast(`${PLAYER_LABEL[player]} ${card.name}: 대상 없음(불발)`);
    await sleep(500);
    return null;
  }

  let target;
  if (isHuman(state, player)) {
    target = await ui.selectTrademark(valid, `${PLAYER_LABEL[player]} ${card.name}: 대상 선택`);
  } else {
    ui.setBanner(`🤖 ${PLAYER_LABEL[player]}(AI) ${card.name}…`);
    await sleep(450);
    target = ai.chooseTarget(state, player, card, valid);
  }

  const toOwner = behavior.toOwner(state, player);
  const fromOwner = target.owner;

  // 방어 능력(보호막/복불복)으로 공격이 막히는지
  const blk = ab.checkAttackBlocked(state, target, player);
  if (blk && blk.blocked) {
    ui.flashAbility(blk.ability);
    ui.showToast(blk.text, 2000);
    await sleep(500);
    return null;
  }

  const collision = fromOwner === opp; // 상대 상표를 뺏김/리셋 = 충돌 연출
  await theater.say(state, { cardType: card.type, actor: player, victim: opp });
  await move(target.id, toOwner, { collision });
  applyMove(state, target.id, toOwner);

  recorder.add({
    kind: 'move', round: state.round, setIndex: state.setIndex,
    actor: player, cardType: card.type, tmId: target.id, fromOwner, toOwner, collision,
  });

  const destLabel = toOwner === OWNER.CENTER ? '중앙' : PLAYER_LABEL[toOwner];
  ui.showToast(`${PLAYER_LABEL[player]} ${card.name}: ${target.name} → ${destLabel}`, 2000);
  await sleep(500);

  return checkInstantWin(state);
}

function endGame(state, recorder, result) {
  ui.setBanner(result.winner ? `🏆 ${PLAYER_LABEL[result.winner]} 승리!` : '🤝 무승부');
  return result;
}

export { countOwned };
