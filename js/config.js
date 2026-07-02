// config.js — 게임 상수, 상표/카드 정의
// "프랜차이즈 상표 분쟁 카드게임" FINAL GDD v1.0 기반

export const TOTAL_ROUNDS = 5;

// 한 라운드 = 3세트. 1차 1장 / 2차 2장 / 3차 2장.
// 각 세트가 끝날 때마다 선플레이어 토큰 교대(라운드당 3번).
export const SET_SIZES = [1, 2, 2];

// 영역(owner) 식별자
export const OWNER = { CENTER: 'center', A: 'A', B: 'B' };

// 플레이어 표시 이름 (갑/을)
export const PLAYER_LABEL = { A: '갑', B: '을' };

// 상표 풀 — 각 상표 id == 능력 id(1:1). 능력 메타/훅은 abilities.js.
// (참고용 실제 브랜드명은 게임에 표기하지 않음 — 저작권)
export const TRADEMARK_POOL = [
  { id: 'coffee',   name: '맹한커피',   emoji: '☕',  rarity: 10 },
  { id: 'burger',   name: '햄부기퀸',   emoji: '🍔', rarity: 10 },
  { id: 'baguette', name: '빨리바게뜨', emoji: '🥖', rarity: 10 },
  { id: 'taunt',    name: '배툭튀떡',   emoji: '🍢', rarity: 10 },
  { id: 'pig',      name: '화남돼지집', emoji: '🐷', rarity: 10 },
  { id: 'cu',       name: '쉬어유',     emoji: '🏪', rarity: 10 },
  { id: 'moms',     name: '남스터치',   emoji: '🍗', rarity: 10 },
  { id: 'daiso',    name: '다없소',     emoji: '🧺', rarity: 10 },
  { id: 'dunkin',   name: '던진도너츠', emoji: '🍩', rarity: 6 },
  { id: 'toast',    name: '아삭토스트', emoji: '🍞', rarity: 10 },
  { id: 'bing',     name: '덜빙',       emoji: '🍧', rarity: 2 },  // 룰 변경(4토큰)
  { id: 'gimbap',   name: '김밥전구',   emoji: '🍙', rarity: 2 },  // 룰 변경(무한 지구전)
];

// 능력 모드(전국 OFF)에서 고정 출전하는 3상표
export const BASE_ABILITY_IDS = ['cu', 'baguette', 'moms'];
// 룰을 바꾸는 상표(전국시대에서만, 낮은 확률)
export const RULE_CHANGE_IDS = ['bing', 'gimbap'];
// 덜빙이 뽑히면 추가되는 무능력 형제 토큰
export const DUBBING_TM = { id: 'dubbing', name: '더빙', emoji: '🧊' };

// 카드 4종 메타데이터. 실제 효과 로직은 cards.js.
export const CARD_DEFS = {
  apply: {
    id: 'apply', name: '출원', emoji: '📄',
    short: '내 상표 ← 중앙',
    desc: '중앙(공개)에 있는 상표 1개를 내 영역으로 가져온다.',
  },
  prove: {
    id: 'prove', name: '사실관계증명', emoji: '🔍',
    short: '내 상표 ← 상대',
    desc: '상대 영역의 상표 1개를 강제로 뒤집어 내 영역으로 가져온다.',
  },
  cancel: {
    id: 'cancel', name: '불사용취소심판', display: '불사용<br>취소심판', emoji: '⏪',
    short: '중앙 ← 상대',
    desc: '상대 영역의 상표 1개를 중앙(공개)으로 되돌린다.',
  },
  smother: {
    id: 'smother', name: '소송뭉개기', emoji: '🚫',
    short: '상대 카드 무효',
    desc: '같은 턴에 상대가 낸 카드 1장의 효과를 무효화한다.',
  },
};

// 매 라운드 고정 손패: 출원 2장 / 사실관계증명 1 / 불사용취소심판 1 / 소송뭉개기 1 = 5장.
// 라운드당 1+2+2=5장을 모두 소진한다.
export const FIXED_HAND = ['apply', 'apply', 'prove', 'cancel', 'smother'];
