// ai.js — AI 대전 상대. 매 판 다른 '성향' + 확률적 선택으로 읽히지 않게.
import { OWNER } from './config.js';
import { countOwned, opponentOf } from './state.js';

// 매 게임 1회 랜덤 성향 부여(공격성/블러프/인내/모험심)
function profile(state) {
  if (!state._ai) {
    const r = () => Math.random();
    state._ai = {
      aggr: 0.35 + 0.55 * r(),    // 공격성(사실관계증명/불사용취소심판 선호)
      bluff: 0.10 + 0.35 * r(),   // 블러프(소송뭉개기 남발/카운터)
      patience: 0.15 + 0.55 * r(), // 인내(강수를 아껴둠)
      risk: 0.25 + 0.60 * r(),    // 모험심(선택 무작위성↑)
    };
  }
  return state._ai;
}

// 카드 기본 가치
function baseScore(state, player, card) {
  const opp = opponentOf(player);
  const mine = countOwned(state, player);
  const center = countOwned(state, OWNER.CENTER);
  const theirs = countOwned(state, opp);
  switch (card.type) {
    case 'apply':  return center === 0 ? -2 : 5 + (mine === 1 ? 3 : 0) + (mine === 2 ? 6 : 0);
    case 'prove':  return theirs === 0 ? -2 : 7 + theirs * 2 + (mine === 2 ? 4 : 0);
    case 'cancel': return theirs === 0 ? -1 : 3 + (theirs >= 2 ? 6 : 0);
    case 'smother': return 2 + (theirs >= 1 ? 2 : 0);
    default: return 0;
  }
}

// 성향/상황을 반영한 조정 점수 + 노이즈
function adjScore(state, player, card, pf) {
  let s = baseScore(state, player, card);
  const round = state.round || 1;
  if (card.type === 'prove') { s *= (0.6 + pf.aggr); if (round <= 2) s -= pf.patience * 6; } // 강수를 초반에 아낌
  if (card.type === 'cancel') { s *= (0.7 + pf.aggr * 0.6); }
  if (card.type === 'smother') { s += pf.bluff * 7; }                                          // 가끔 선제 카운터
  s += (Math.random() - 0.5) * 5;                                                              // 지터
  return s;
}

function softmax(scores, temp) {
  const m = Math.max(...scores);
  return scores.map((s) => Math.exp((s - m) / temp));
}
function weightedPick(weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

// 이번 세트에 낼 카드 count장 — 점수 기반 확률 추출(비복원)
export function chooseSubmission(state, player, count) {
  const pf = profile(state);
  const temp = 1.2 + pf.risk * 2.6;
  const hand = [...state.hands[player]];
  const chosen = [];
  for (let k = 0; k < count && hand.length; k++) {
    const scores = hand.map((c) => adjScore(state, player, c, pf));
    const i = weightedPick(softmax(scores, temp));
    chosen.push(hand[i]);
    hand.splice(i, 1);
  }
  return chosen;
}

// 대상 선택도 확률적으로(항상 첫 번째 X)
export function chooseTarget(state, player, card, valid) {
  if (!valid.length) return null;
  const pf = profile(state);
  const opp = opponentOf(player);
  const scores = valid.map((t) => {
    let s = 1 + Math.random() * 2;
    if ((card.type === 'prove' || card.type === 'cancel') && countOwned(state, opp) >= 2) s += 3;
    return s;
  });
  return valid[weightedPick(softmax(scores, 1.0 + pf.risk * 1.5))];
}
