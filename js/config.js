// config.js — 게임 상수, 상표/카드 정의
// "프랜차이즈 상표 분쟁 카드게임" FINAL GDD v1.0 기반

export const TOTAL_ROUNDS = 5;

// 한 라운드 = 3세트. 1차 1장 / 2차 2장 / 3차 2장.
// 각 세트가 끝날 때마다 선플레이어 토큰 교대(라운드당 3번).
export const SET_SIZES = [1, 2, 2];

// 라운드 시작 시 지급하는 손패 수(약간의 선택지를 위해 필요량 5장보다 많게).
export const HAND_SIZE = 7;

// 영역(owner) 식별자
export const OWNER = { CENTER: 'center', A: 'A', B: 'B' };

// 플레이어 표시 이름 (갑/을)
export const PLAYER_LABEL = { A: '갑', B: '을' };

// 상표 3종 — 각 상표는 능력 1개 보유(선택 모드에서만 활성)
export const TRADEMARKS = [
  { id: 'coffee',     name: '맹한커피',   emoji: '☕', ability: 'coffee' },
  { id: 'burger',     name: '햄부기퀸',   emoji: '🍔', ability: 'burger' },
  { id: 'tteok',      name: '염라떡볶이', emoji: '🌶️', ability: 'tteok'  },
];

// 카드 4종 메타데이터. 실제 효과 로직은 cards.js.
export const CARD_DEFS = {
  apply: {
    id: 'apply', name: '출원', emoji: '📄',
    short: '중앙의 상표를 내 영역으로',
    desc: '중앙(공개)에 있는 상표 1개를 내 영역으로 가져온다.',
  },
  prove: {
    id: 'prove', name: '사실관계증명', emoji: '📑',
    short: '상대의 상표를 빼앗아 내 영역으로',
    desc: '상대 영역의 상표 1개를 강제로 뒤집어 내 영역으로 가져온다.',
  },
  cancel: {
    id: 'cancel', name: '불사용취소심판', emoji: '🚫',
    short: '상대의 상표를 중앙으로 리셋',
    desc: '상대 영역의 상표 1개를 중앙(공개)으로 되돌린다.',
  },
  smother: {
    id: 'smother', name: '소송뭉개기', emoji: '🗂️',
    short: '상대 카드 1장의 효과 무효',
    desc: '이번 세트에서 상대가 낸, 아직 처리되지 않은 카드 1장의 효과를 무효화한다.',
  },
};

// 라운드 손패에 섞을 카드 풀(가중치). 출원/증명을 더 자주 등장.
export const CARD_POOL = [
  'apply', 'apply', 'apply',
  'prove', 'prove',
  'cancel', 'cancel',
  'smother',
];
