// ai.js — AI 대전 상대(휴리스틱)
import { OWNER } from './config.js';
import { countOwned, opponentOf } from './state.js';
import { CARD_BEHAVIOR } from './cards.js';

// 현재 상태에서 카드 1장의 가치 점수
function scoreCard(state, player, card) {
  const opp = opponentOf(player);
  const mine = countOwned(state, player);
  const center = countOwned(state, OWNER.CENTER);
  const theirs = countOwned(state, opp);

  switch (card.type) {
    case 'apply':   // 중앙이 있으면 좋음. 2개째 확보 직전이면 가치↑
      if (center === 0) return -1;
      return 6 + (mine === 1 ? 3 : 0) + (mine === 2 ? 5 : 0);
    case 'prove':   // 상대 상표를 빼앗아 옴(가장 강력). 상대가 많이 가질수록 가치↑
      if (theirs === 0) return -1;
      return 8 + theirs * 2 + (mine === 2 ? 4 : 0);
    case 'cancel':  // 상대 견제(상대가 2개면 매우 중요)
      if (theirs === 0) return -1;
      return 4 + (theirs >= 2 ? 6 : 0);
    case 'smother': // 방어용. 상대가 강할 때 보유 가치
      return 3 + (theirs >= 1 ? 2 : 0);
    default: return 0;
  }
}

// 이번 세트에 낼 카드 count장 선택
export function chooseSubmission(state, player, count) {
  const hand = [...state.hands[player]];
  const ranked = hand
    .map((c) => ({ c, s: scoreCard(state, player, c) }))
    .sort((a, b) => b.s - a.s);
  return ranked.slice(0, count).map((x) => x.c);
}

// 카드 해결 시 상표 대상 선택
export function chooseTarget(state, player, card, validTargets) {
  if (validTargets.length === 0) return null;
  const opp = opponentOf(player);
  if (card.type === 'prove' || card.type === 'cancel') {
    // 상대가 2개 보유 중이면 그 중 하나를 우선(라운드 토큰 저지)
    return validTargets[0];
  }
  // 출원: 능력 보유 가치가 큰 상표 우선(임의로 첫 번째)
  return validTargets[0];
}

// 소송뭉개기 대상: 상대 미처리 카드 중 가장 위협적인 것의 인덱스
export function chooseSmotherTarget(state, player, pendingCards) {
  if (!pendingCards.length) return null;
  let best = 0, bestScore = -Infinity;
  pendingCards.forEach((pc, i) => {
    const s = scoreCard(state, opponentOf(player), pc.card);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}
