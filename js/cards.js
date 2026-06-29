// cards.js — 카드 효과 정의(유효 대상 + 해결 로직)
import { OWNER } from './config.js';
import { opponentOf } from './state.js';

// 각 카드 타입의 동작 정의.
// validTargets(state, actor): 현재 낼 수 있는 상표 목록
// effect(state, actor, tm): 상표의 목표 소유자(toOwner)를 반환(이동은 호출부가 수행)
export const CARD_BEHAVIOR = {
  // 출원: 중앙 상표 → 내 영역
  apply: {
    needsTarget: 'trademark',
    validTargets: (state, actor) =>
      state.trademarks.filter((t) => t.owner === OWNER.CENTER),
    toOwner: (state, actor) => actor,
  },
  // 사실관계증명: 상대 영역 상표 → 내 영역(강제 뒤집기)
  prove: {
    needsTarget: 'trademark',
    validTargets: (state, actor) =>
      state.trademarks.filter((t) => t.owner === opponentOf(actor)),
    toOwner: (state, actor) => actor,
  },
  // 불사용취소심판: 상대 영역 상표 → 중앙 리셋
  cancel: {
    needsTarget: 'trademark',
    validTargets: (state, actor) =>
      state.trademarks.filter((t) => t.owner === opponentOf(actor)),
    toOwner: () => OWNER.CENTER,
  },
  // 소송뭉개기: 상표 이동 없음. 상대의 미처리 카드 1장을 무효화.
  smother: {
    needsTarget: 'card',
    validTargets: () => [], // 상표가 아닌 '상대 미처리 카드'를 대상으로 함(engine에서 처리)
    toOwner: () => null,
  },
};

// 카드가 현재 유효한 상표 대상을 가지는지(소송뭉개기 제외)
export function hasValidTrademarkTarget(state, card, actor) {
  const b = CARD_BEHAVIOR[card.type];
  if (b.needsTarget !== 'trademark') return false;
  return b.validTargets(state, actor).length > 0;
}
