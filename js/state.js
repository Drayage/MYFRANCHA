// state.js — 게임 상태 모델 + 순수 헬퍼
import {
  TOTAL_ROUNDS, OWNER, FIXED_HAND, CARD_DEFS,
  TRADEMARK_POOL, BASE_ABILITY_IDS, RULE_CHANGE_IDS, DUBBING_TM,
} from './config.js';

let cardSeq = 0;
export function makeCard(typeId) {
  return { uid: `c${++cardSeq}`, type: typeId, ...CARD_DEFS[typeId] };
}

// rarity 가중 비복원 샘플링
function weightedSample(pool, n) {
  const arr = [...pool];
  const out = [];
  for (let k = 0; k < n && arr.length; k++) {
    const total = arr.reduce((s, t) => s + (t.rarity || 10), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < arr.length; i++) { r -= (arr[i].rarity || 10); if (r <= 0) { idx = i; break; } }
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

// 보드 상표 구성:
// 전국 ON → 전체 풀 랜덤 / 능력 ON(전국 OFF) → 고정 3 / 둘 다 OFF → 일반 풀 랜덤(능력 무효)
function buildTrademarks(expansion, abilities) {
  let picked;
  if (expansion) {
    picked = weightedSample(TRADEMARK_POOL, 3);
  } else if (abilities) {
    picked = BASE_ABILITY_IDS.map((id) => TRADEMARK_POOL.find((t) => t.id === id));
  } else {
    const normal = TRADEMARK_POOL.filter((t) => !RULE_CHANGE_IDS.includes(t.id));
    picked = weightedSample(normal, 3);
  }
  const tms = picked.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, ability: t.id, owner: OWNER.CENTER }));
  // 덜빙이 뽑히면 무능력 형제 토큰(더빙) 추가 → 4개 올킬
  if (picked.some((t) => t.id === 'bing')) {
    tms.push({ id: DUBBING_TM.id, name: DUBBING_TM.name, emoji: DUBBING_TM.emoji, ability: null, owner: OWNER.CENTER });
  }
  return tms;
}

// 매 라운드 고정 손패(출원2/증명1/취소1/뭉개1 = 5장)를 순서만 섞어 지급
export function dealHand() {
  const types = [...FIXED_HAND];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types.map(makeCard);
}

// 새 게임 상태 생성
export function createState({ mode = 'ai', abilitiesEnabled = false, expansionEnabled = false, theaterEnabled = false } = {}) {
  const abilities = expansionEnabled || abilitiesEnabled;   // 전국시대는 능력 포함
  const trademarks = buildTrademarks(expansionEnabled, abilities);
  const noInstantWin = trademarks.some((t) => t.ability === 'gimbap');
  return {
    mode,                       // 'ai' | 'local'
    abilitiesEnabled: abilities,
    expansionEnabled,
    theaterEnabled,
    humanSide: mode === 'ai' ? (Math.random() < 0.5 ? 'A' : 'B') : 'A', // AI모드는 사람 진영 랜덤
    round: 1,
    setIndex: 0,                // 0,1,2 (1차/2차/3차)
    phase: 'setup',             // setup | playing | round-end | game-over
    firstPlayer: 'A',           // 선플레이어 토큰(선공은 항상 갑)
    trademarks,
    hands: { A: [], B: [] },
    roundTokens: { A: 0, B: 0 },
    roundSecuredTwo: null,      // 이번 라운드에 먼저 2개 확보한 사람
    renownedClaim: null,        // 저명상표 주장으로 지정된 상표 id(1R 1차에서만 유효)
    noInstantWin,               // 김밥전구: 즉시 승리 없음(라운드 종료 시점에만 판정)
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

// 순수 전체 소유 판정(noInstantWin 무시) — 김밥전구의 "라운드 종료 시점" 판정에 사용
export function checkFullOwnership(state) {
  for (const p of ['A', 'B']) {
    if (countOwned(state, p) === state.trademarks.length) return p;
  }
  return null;
}

// 즉시 승리: 한 플레이어가 모든 상표 소유 (김밥전구가 있으면 라운드 중 비활성)
export function checkInstantWin(state) {
  if (state.noInstantWin) return null;
  return checkFullOwnership(state);
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
