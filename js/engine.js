// engine.js — 라운드/페이즈 진행 상태기계 + 카드 해결 파이프라인 (+ 능력 훅)
import { TOTAL_ROUNDS, SET_SIZES, PLAYER_LABEL, OWNER } from './config.js';
import {
  dealHand, opponentOf, applyMove, checkInstantWin, checkFullOwnership,
  evaluateRoundToken, finalResult, countOwned,
} from './state.js';
import { CARD_BEHAVIOR } from './cards.js';
import * as ab from './abilities.js';
import * as ai from './ai.js';
import * as ui from './ui.js';
import * as theater from './theater.js';
import { move, sleep } from './animation.js';
import { sfx } from './audio.js';
import { saveCheckpoint, clearCheckpoint } from './persistence.js';

const isHuman = (state, player) => state.mode === 'local' || player === state.humanSide;
const describe = (cards) => cards.map((c) => c.name).join(', ');
const MOVE_TYPES = ['apply', 'prove', 'cancel'];

// 게임 1판 실행. recorder에 이벤트를 기록한다.
// resume: 새로고침 등으로 중단된 판을 이어할 때 넘기는 저장된 state 스냅샷(라운드/세트 경계에서 저장됨).
// 넘기면 시작 단계(룰 안내·저명상표 주장)를 건너뛰고, 저장된 라운드의 저장된 세트부터 재개한다.
export async function runGame(state, recorder, resume = null) {
  const resumeRound = resume ? resume.round : null;
  const resumeSet = resume ? resume.setIndex : null;
  if (resume) Object.assign(state, resume);

  ui.buildBoard(state);
  ui.updateHUD(state);
  if (resume) {
    // buildBoard는 마커/토큰만 새로 그리므로, 새로고침 시점에 걸려있던 시각 효과를 복원.
    for (const t of state.trademarks) if (t.shielded) ui.setShieldVisible(t.id, true);
    if (state.round === 1 && state.setIndex === 0 && state.renownedClaim) {
      ui.setRenownedMark(state.renownedClaim, true);
    }
  } else {
    await announceRuleChanges(state);
    await renownedClaimPhase(state);
  }

  for (let round = resumeRound || 1; round <= TOTAL_ROUNDS; round++) {
    const isResumedRound = round === resumeRound;
    if (!isResumedRound) {
      state.round = round;
      state.roundSecuredTwo = null;
      state.hands.A = dealHand();
      state.hands.B = dealHand();

      // 라운드 시작 능력(보호막/패 변환)
      const rs = ab.onRoundStart(state);
      if (rs.shieldTmId) {
        ui.flashAbility('pig');
        ui.setShieldVisible(rs.shieldTmId, true);
        ui.showToast('🛡️ 화남돼지집: 대상 지정 방지 보호막 생성!');
      }
      if (rs.daiso) { ui.flashAbility('daiso'); ui.showToast(`🔁 다없소: ${PLAYER_LABEL[rs.daiso]} 출원→소송뭉개기`); }
      ui.updateHUD(state);
      if (rs.shieldTmId || rs.daiso) await sleep(500);
    }

    for (let s = isResumedRound ? resumeSet : 0; s < SET_SIZES.length; s++) {
      state.setIndex = s;
      ui.updateHUD(state);
      const size = SET_SIZES[s];
      // 저명상표 주장이 걸려있는 동안(1R 1차 한정)은 토스트가 사라진 뒤에도 배너로 계속 안내
      const renownedNote = (round === 1 && s === 0 && state.renownedClaim) ? ' · 📜 저명상표는 출원 불가(눌러서 확인)' : '';
      ui.setBanner(`R${round} ${['1차','2차','3차'][s]}(${size}장) · 선플 ${PLAYER_LABEL[state.firstPlayer]}${renownedNote}`);

      // 세트 시작(제출 받기 직전) 체크포인트 — 새로고침 시 이 세트 처음부터 다시 시작.
      saveCheckpoint(state);
      const submissions = await collectSubmissions(state, size);
      const ended = await resolveSet(state, submissions, size, recorder);
      if (ended) { state.phase = 'game-over'; return endGame(state, recorder, { reason: 'instant', winner: state.winner }); }

      // 저명상표 주장 표시는 1R 1차가 끝나면 제거(그 이후로는 효과 없음)
      if (round === 1 && s === 0 && state.renownedClaim) {
        ui.setRenownedMark(state.renownedClaim, false);
      }

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

    // 김밥전구: 라운드 중엔 즉시승리 없이 진행하다가, 라운드 종료 시점에 전체 소유면 그때 승리 확정
    if (state.noInstantWin) {
      const w = checkFullOwnership(state);
      if (w) {
        state.winner = w;
        state.phase = 'game-over';
        return endGame(state, recorder, { reason: 'instant', winner: w });
      }
    }
  }

  // 5라운드 종료 판정
  const result = finalResult(state);
  state.winner = result.winner;
  state.phase = 'game-over';
  return endGame(state, recorder, result);
}

// 룰을 바꾸는 능력이 이번 판 보드에 등장하면, 시작 전에 모두에게 알린다(모르고 당하면 안 되니까).
async function announceRuleChanges(state) {
  const ruleChangers = state.trademarks.filter((t) => t.ability && ab.ABILITIES[t.ability]?.ruleChange);
  for (const tm of ruleChangers) {
    const info = ab.ABILITIES[tm.ability];
    ui.showToast(`⚠️ ${tm.name} 등장! ${info.desc}`, 3200, { multi: true });
    await sleep(700);
  }
}

// 저명상표 주장: 능력 모드에서 라운드1 시작 전, 후공(을)이 상표 1개를 지정 —
// 갑은 1R 1차에서 그 상표를 출원으로 가져올 수 없다.
async function renownedClaimPhase(state) {
  if (!state.abilitiesEnabled) return;
  const claimant = 'B';
  ui.showToast('📜 저명상표 주장: 상대는 1라운드 1차에 그 상표를 출원할 수 없습니다!', 2800, { multi: true });
  ui.setBanner(`${PLAYER_LABEL[claimant]} — 저명상표 주장: 상표 1개를 지정하세요`);
  await sleep(500);

  let claimed;
  if (isHuman(state, claimant)) {
    claimed = await ui.selectRenownedClaim(state.trademarks, `${PLAYER_LABEL[claimant]} — 상표를 클릭해 능력을 확인한 뒤 "이걸로 선택"을 누르세요`);
  } else {
    ui.setBanner(`🤖 ${PLAYER_LABEL[claimant]}(AI) — 저명상표 고르는 중…`);
    await sleep(500);
    claimed = state.trademarks[Math.floor(Math.random() * state.trademarks.length)];
  }
  state.renownedClaim = claimed.id;
  ui.setRenownedMark(claimed.id, true);
  ui.showToast(`📜 ${PLAYER_LABEL[claimant]}: "${claimed.name}"은(는) 저명상표! 갑은 1차에서 출원 불가`, 2800, { multi: true });
  await sleep(700);
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
  ui.showRevealArea(state, slots, order);
  ui.setBanner(`R${state.round} ${['1차','2차','3차'][state.setIndex]} · 카드 공개!`);
  await sleep(650);
  await ui.flipRevealAll();
  await sleep(550);

  // 2) 같은 턴 무효화 선계산 — 이 시점(카드 공개 직후)에 던진도너츠 보유 여부를 "확정"한다.
  //    이후 처리 순서상 다른 카드가 먼저 처리되며 던진도너츠가 다른 사람 손에 넘어가도
  //    이미 공개된 소송뭉개기는 그 결정을 그대로 유지한다(카드 자체가 바뀐 것으로 취급).
  //    아삭토스트 면역은 여기서 걸러내지 않고 항상 "무효" 도장을 먼저 찍는다 —
  //    실제 처리 시점(3)에 재확인해서 면역이면 무효→유효로 뒤집는 연출을 보여준다.
  for (let i = 0; i < size; i++) {
    for (const p of ['A', 'B']) {
      const slot = slots[p][i];
      if (slot && slot.card.type === 'smother') {
        const victim = slots[opponentOf(p)][i];
        slot.dunkinCopy = ab.dunkinHolder(state) === p; // 카드 공개 시점에 고정
        if (slot.dunkinCopy) {
          ui.transformRevealToDunkin(p, i); // 소송뭉개기가 던진도너츠 카드로 시각적으로 변형(효과는 자기 턴에 실행)
        } else {
          if (victim) {
            victim.nullified = true;
            ui.markRevealNullified(opponentOf(p), i);
            sfx('nullify');
          }
          ui.markRevealUsed(p, i);
        }
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
      sfx('token');
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
    // 아삭토스트: 실제 처리 시점에 재확인(라운드 중 획득해도 반영) — 면역이면 무효→유효로 뒤집고 정상 발동.
    if (ab.isNullifyImmune(state, player)) {
      ui.flashAbility('toast');
      await ui.flipStampToSaved(player, idx);
      ui.showToast(`🛟 아삭토스트 발동: ${PLAYER_LABEL[player]} ${card.name} 무효화 무시하고 발동!`, 2200);
      await sleep(300);
      slot.nullified = false;
    } else {
      ui.showToast(`${PLAYER_LABEL[player]} ${card.name} 무효(불발)`);
      await sleep(500);
      return null;
    }
  }

  // 소송뭉개기: 던진도너츠 여부는 카드 공개 시점(2)에 이미 확정됐다(slot.dunkinCopy) —
  // 중간에 던진도너츠 소유가 바뀌어도 이 카드의 정체성은 그대로 유지된다.
  if (card.type === 'smother') {
    const co = slots[opp][idx];
    if (slot.dunkinCopy) {
      if (co && MOVE_TYPES.includes(co.card.type)) {
        ui.flashAbility('dunkin');
        ui.showToast(`🍩 던진도너츠 역고소 카피: ${co.card.name} 효과 복사! (상대 카드는 무효화되지 않음)`, 2400, { multi: true });
        await theater.say(state, { cardType: 'smother', actor: player, victim: opp });
        await sleep(300);
        return performMove(state, player, co.card, recorder);
      }
      ui.showToast(`🍩 던진도너츠: 복사할 상대 카드가 없어 불발`);
      await sleep(400);
      return null;
    }
    recorder.add({ kind: 'nullify', round: state.round, actor: player, victim: opp });
    ui.showToast(`🚫 ${PLAYER_LABEL[player]} 소송뭉개기: ${PLAYER_LABEL[opp]} 같은 턴 무효`, 2000);
    await theater.say(state, { cardType: 'smother', actor: player, victim: opp });
    await sleep(300);
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

  // 화남돼지집 보호막: 소유자와 무관하게(중앙 포함) 대상 지정 자체를 1회 차단
  const pigBlk = ab.checkPigShieldBlocked(state, target);
  if (pigBlk && pigBlk.blocked) {
    ui.flashAbility('pig');
    ui.setShieldVisible(pigBlk.tmId, false);
    ui.showToast(pigBlk.text, 2000);
    await sleep(500);
    return null;
  }

  // 맹한커피 복불복: 뒷면 카드 2장 중 하나를 골라 성공/실패로 공격 통과 여부를 정한다(양쪽 다 관전)
  if (ab.isCoffeeGambleTarget(state, target, player)) {
    ui.flashAbility('coffee');
    const blocked = await ui.playCoffeeGamble(player, target.owner, isHuman(state, player));
    if (blocked) return null;
  }

  const collision = fromOwner === opp; // 상대 상표를 뺏김/리셋 = 충돌 연출
  await theater.say(state, { cardType: card.type, actor: player, victim: opp });
  sfx(collision ? 'collision' : 'move');
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
  clearCheckpoint();
  if (!result.winner) {
    ui.setBanner('🤝 무승부');
  } else if (state.mode === 'ai') {
    const won = result.winner === state.humanSide;
    ui.setBanner(won ? '🎉 승리했습니다!' : '😢 패배했습니다…');
  } else {
    ui.setBanner(`🏆 ${PLAYER_LABEL[result.winner]} 승리!`);
  }
  return result;
}

export { countOwned };
