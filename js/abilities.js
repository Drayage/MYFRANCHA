// abilities.js — 상표 능력 레지스트리 + 엔진 훅 헬퍼
// 능력은 해당 상표를 소유한 플레이어(holder)에게 적용된다.
import { makeCard } from './state.js';

export const opp = (p) => (p === 'A' ? 'B' : 'A');

// 표시용 메타 (icon = 상표 위 능력 마커, desc = 클릭 설명)
export const ABILITIES = {
  coffee:   { name: '맹한커피',   icon: '🪙', desc: '이 상표가 공격받을 때 50% 확률로 그 공격을 무효화한다.' },
  burger:   { name: '햄부기퀸',   icon: '🔎', desc: '내가 후공일 때, 상대 카드를 먼저 확인한 뒤 낸다.' },
  baguette: { name: '빨리바게뜨', icon: '👑', desc: '라운드가 바뀌어도 선플레이어 토큰을 넘기지 않는다.' },
  taunt:    { name: '배툭튀떡',   icon: '💢', desc: '내 영역에 있으면 상대는 이 상표부터 공격/강탈해야 한다.' },
  pig:      { name: '화남돼지집', icon: '🛡️', desc: '라운드마다 들어오는 첫 공격을 1회 무시하는 보호막.' },
  cu:       { name: '쉬어유',     icon: '👀', desc: '내가 선공·1차일 때 상대 카드를 확인한 뒤 낸다.' },
  moms:     { name: '남스터치',   icon: '💪', desc: '출원(가져오기)을 상대 상표 강탈로도 쓸 수 있다.' },
  daiso:    { name: '다없소',     icon: '🔁', desc: '라운드 시작 시 손패의 출원 1장을 소송뭉개기로 바꾼다.' },
  dunkin:   { name: '던진도너츠', icon: '🍩', desc: '소송뭉개기로 무효화할 때 상대의 같은 턴 카드 효과를 복사한다.' },
  toast:    { name: '아삭토스트', icon: '🛟', desc: '내 카드는 상대의 소송뭉개기에 면역이다.' },
  bing:     { name: '덜빙',       icon: '🍧', desc: '형제 토큰 더빙이 추가되어 4개 모두 확보해야 승리한다.' },
  gimbap:   { name: '김밥전구',   icon: '⏳', desc: '상표를 모두 확보해도 즉시 승리하지 않는다(5라운드까지).' },
};

// 능력 모드가 켜졌고 해당 능력 토큰을 소유한 플레이어(아니면 null)
export function holderOf(state, id) {
  if (!state.abilitiesEnabled) return null;
  const tm = state.trademarks.find((t) => t.ability === id);
  return (tm && tm.owner !== 'center') ? tm.owner : null;
}

// 이번 세트에 미리보기(peek)하는 플레이어: cu(선·1차) / burger(후)
export function peekerFor(state) {
  const cu = holderOf(state, 'cu');
  if (cu && cu === state.firstPlayer && state.setIndex === 0) return { player: cu, ability: 'cu' };
  const bg = holderOf(state, 'burger');
  if (bg && bg !== state.firstPlayer) return { player: bg, ability: 'burger' };
  return null;
}

// 라운드 시작 훅: 보호막 세팅 + 다없소 패 변환. 토스트용 리포트 반환.
export function onRoundStart(state) {
  state.shields = { A: false, B: false };
  const report = { shield: null, daiso: null };
  const pig = holderOf(state, 'pig');
  if (pig) { state.shields[pig] = true; report.shield = pig; }
  const daiso = holderOf(state, 'daiso');
  if (daiso) {
    const hand = state.hands[daiso];
    const i = hand.findIndex((c) => c.type === 'apply');
    if (i >= 0) { hand[i] = makeCard('smother'); report.daiso = daiso; }
  }
  return report;
}

// 유효 타겟 수정: 도발(강제) + 남스터치(강탈 업글)
export function modifyTargets(state, actor, card, valid) {
  // 도발: 상대가 도발 토큰을 자기 영역에 보유 & 이 카드가 상대 공격이면 그 토큰만 대상
  const tauntHolder = holderOf(state, 'taunt');
  if (tauntHolder && tauntHolder === opp(actor) && (card.type === 'prove' || card.type === 'cancel')) {
    const tauntTm = state.trademarks.find((t) => t.ability === 'taunt');
    if (tauntTm && tauntTm.owner === opp(actor) && valid.some((t) => t.id === tauntTm.id)) {
      return valid.filter((t) => t.id === tauntTm.id);
    }
  }
  // 남스터치: 출원을 쓸 때 상대 영역 상표도 대상(강탈)
  if (card.type === 'apply' && holderOf(state, 'moms') === actor) {
    const stolen = state.trademarks.filter((t) => t.owner === opp(actor));
    return valid.concat(stolen);
  }
  return valid;
}

// 공격 차단 판정(대상이 상대 소유일 때만): 확정 보호막(방어자) + 복불복(대상 토큰이 맹한커피)
export function checkAttackBlocked(state, targetTm, attacker) {
  const defender = targetTm.owner;
  if (defender === 'center' || defender === attacker) return null; // 공격 아님
  if (holderOf(state, 'pig') === defender && state.shields && state.shields[defender]) {
    state.shields[defender] = false;
    return { blocked: true, ability: 'pig', text: '🛡️ 화남돼지집 보호막: 공격 무시!' };
  }
  if (targetTm.ability === 'coffee' && holderOf(state, 'coffee') === defender && Math.random() < 0.5) {
    return { blocked: true, ability: 'coffee', text: '🪙 맹한커피 복불복: 공격 무효!' };
  }
  return null;
}

// 소송뭉개기 면역(아삭토스트 보유자의 카드)
export function isNullifyImmune(state, cardOwner) {
  return holderOf(state, 'toast') === cardOwner;
}

// 역고소 카피 보유자
export function dunkinHolder(state) { return holderOf(state, 'dunkin'); }

// 선 유지(빨리바게뜨): holder가 현재 선플레이어면 교대 스킵
export function keepsFirst(state) {
  const bg = holderOf(state, 'baguette');
  return bg != null && bg === state.firstPlayer;
}
