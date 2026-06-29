// state.js — 게임 상태 모델 + 순수 헬퍼
import { TOTAL_ROUNDS, OWNER, TRADEMARKS, CARD_POOL, CARD_DEFS, HAND_SIZE } from './config.js';

let cardSeq = 0;
function makeCard(typeId) {
  return { uid: `c${++cardSeq}`, type: typeId, ...CARD_DEFS[typeId] };
}

// 라운드 손패 한 벌 생성(랜덤)
export function dealHand(n = HAND_SIZE) {
  const hand = [];
  for (let i = 0; i < n; i++) {
    const t = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
    hand.push(makeCard(t));
  }
  return hand;
}

// 새 게임 상태 생성
export function createState({ mode = 'ai', abilitiesEnabled = false, theaterEnabled = false } = {}) {
  return {
    mode,                       // 'ai' | 'local'
    abilitiesEnabled,
    theaterEnabled,
    round: 1,
    setIndex: 0,                // 0,1,2 (1차/2차/3차)
    phase: 'setup',             // setup | playing | round-end | game-over
    firstPlayer: 'A',           // 선플레이어 토큰
    trademarks: TRADEMARKS.map((t) => ({ ...t, owner: OWNER.CENTER })),
    hands: { A: [], B: [] },
    roundTokens: { A: 0, B: 0 },
    roundSecuredTwo: null,      // 이번 라운드에 먼저 2개 확보한 사람
    winner: null,
    log: [],
  };
}

export const opponentOf = (p) => (p === 'A' ? 'B' : 'A');

// 특정 소유자가 가진 상표 수
export function countOwned(state, owner) {
  return state.trademarks.filter((t) => t.owner === owner).length;
}

export function trademarkById(state, id) {
  return state.trademarks.find((t) => t.id === id);
}

// 상표 소유권 이동(상태만 변경 — 애니메이션은 호출부에서 await)
export function applyMove(state, tmId, toOwner) {
  const tm = trademarkById(state, tmId);
  const from = tm.owner;
  tm.owner = toOwner;
  return from;
}

// 즉시 승리: 한 플레이어가 상표 3개 모두 소유
export function checkInstantWin(state) {
  for (const p of ['A', 'B']) {
    if (countOwned(state, p) === state.trademarks.length) return p;
  }
  return null;
}

// 라운드 토큰: 한 라운드 중 상표 2개를 "먼저" 확보한 플레이어가 획득(라운드당 1개).
// 카드 처리 직후 호출. 아직 이번 라운드 토큰이 안 났을 때만 평가.
export function evaluateRoundToken(state) {
  if (state.roundSecuredTwo) return null;
  for (const p of ['A', 'B']) {
    if (countOwned(state, p) >= 2) {
      state.roundSecuredTwo = p;
      state.roundTokens[p] += 1;
      return p;
    }
  }
  return null;
}

// 5라운드 종료 판정
export function finalResult(state) {
  const a = countOwned(state, 'A');
  const b = countOwned(state, 'B');
  if (a !== b) return { winner: a > b ? 'A' : 'B', reason: 'trademarks' };
  // 동점 → 라운드 토큰
  if (state.roundTokens.A !== state.roundTokens.B) {
    return { winner: state.roundTokens.A > state.roundTokens.B ? 'A' : 'B', reason: 'tokens' };
  }
  // 완전 동점 → 마지막 라운드 토큰 보유자
  const last = [...state.log].reverse().find((e) => e.kind === 'round-token');
  if (last) return { winner: last.actor, reason: 'last-token' };
  return { winner: null, reason: 'draw' };
}

export function isGameOver(state) {
  return state.round > TOTAL_ROUNDS || state.winner != null;
}
