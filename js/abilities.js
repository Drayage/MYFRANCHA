// abilities.js — 상표 확장 능력(선택 모드, 기본 OFF)
// GDD: 각 상표는 능력 1개 보유.
import { countOwned } from './state.js';

export const ABILITY_INFO = {
  coffee: {
    name: '맹한커피', icon: '👀',
    desc: '매 라운드 첫 카드는 상대 카드를 확인한 뒤 제출할 수 있다.',
  },
  burger: {
    name: '햄부기퀸', icon: '👑',
    desc: '선플레이어가 된 뒤에는 선플레이어 토큰을 넘기지 않는다.',
  },
  tteok: {
    name: '염라떡볶이', icon: '🔀',
    desc: '테이블→손패 이동을 상대 손패 대상 이동으로 바꿀 수 있다.',
  },
};

// 능력 보유자 = 해당 상표를 소유한 플레이어(능력 모드 ON일 때).
export function abilityHolder(state, abilityId) {
  if (!state.abilitiesEnabled) return null;
  const tm = state.trademarks.find((t) => t.ability === abilityId);
  if (!tm || tm.owner === 'center') return null;
  return tm.owner;
}

// 햄부기퀸: 현재 선플레이어가 햄부기퀸 보유자면 토큰 교대를 건너뛴다.
export function burgerKeepsToken(state) {
  return abilityHolder(state, 'burger') === state.firstPlayer;
}

// 맹한커피: 해당 플레이어가 라운드 첫 카드에서 상대 카드를 미리 볼 수 있는지
export function coffeePeek(state, player) {
  return abilityHolder(state, 'coffee') === player && state.setIndex === 0;
}

export { countOwned };
