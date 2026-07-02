// abilities.js — 상표 능력 레지스트리 + 엔진 훅 헬퍼
// 능력은 해당 상표를 소유한 플레이어(holder)에게 적용된다.
import { makeCard } from './state.js';

export const opp = (p) => (p === 'A' ? 'B' : 'A');

// 표시용 메타 (icon = 상표 위 능력 마커, desc = 클릭 설명)
export const ABILITIES = {
  coffee:   { name: '맹한커피',   icon: '🪙', desc: '이 상표가 공격받으면 뒷면 카드 2장 중 하나를 골라 성공/실패로 그 공격을 막을지 정한다(50%).' },
  burger:   { name: '햄부기퀸',   icon: '🔎', desc: '내가 후공일 때, 상대 카드를 먼저 확인한 뒤 낸다.' },
  baguette: { name: '빨리바게뜨', icon: '👑', desc: '라운드가 바뀌어도 선플레이어 토큰을 넘기지 않는다.' },
  taunt:    { name: '배툭튀떡',   icon: '💢', desc: '내 영역에 있으면 상대는 이 상표부터 공격/강탈해야 한다.' },
  pig:      { name: '화남돼지집', icon: '🛡️', desc: '라운드 시작 시마다 화남돼지집 상표가 대상이 되는 것을 한 번 막는 보호막을 생성한다.' },
  cu:       { name: '쉬어유',     icon: '👀', desc: '내가 선공·1차(라운드 첫 턴)일 때 상대 카드를 확인한 뒤 낸다.' },
  moms:     { name: '남스터치',   icon: '💪', desc: '출원(가져오기)을 상대 상표 강탈로도 쓸 수 있다.' },
  daiso:    { name: '다없소',     icon: '🔁', desc: '라운드 시작 시 손패의 출원 1장을 소송뭉개기로 바꾼다.' },
  dunkin:   { name: '던진도너츠', icon: '🍩', desc: '소송뭉개기 대신 대상 카드의 효과를 그대로 복사해서 쓴다(원래 카드는 무효화되지 않고 정상 발동).' },
  toast:    { name: '아삭토스트', icon: '🛟', desc: '내 카드가 무효화되려는 순간, 무효 도장이 유효(초록)로 바뀌며 정상 발동한다.' },
  bing:     { name: '덜빙',       icon: '🍧', desc: '형제 토큰 더빙이 추가되어 4개 모두 확보해야 승리한다.', ruleChange: true },
  gimbap:   { name: '김밥전구',   icon: '⏳', desc: '라운드 중간에 상표를 모두 확보해도 즉시 승리하지 않는다. 라운드 종료 시점에 모두 갖고 있어야 승리한다.', ruleChange: true },
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

// 라운드 시작 훅: 화남돼지집 보호막(토큰 자체, 소유자 무관) + 다없소 패 변환. 토스트용 리포트 반환.
export function onRoundStart(state) {
  const report = { shieldTmId: null, daiso: null };
  if (state.abilitiesEnabled) {
    const pigTm = state.trademarks.find((t) => t.ability === 'pig');
    if (pigTm) { pigTm.shielded = true; report.shieldTmId = pigTm.id; }
  }
  const daiso = holderOf(state, 'daiso');
  if (daiso) {
    const hand = state.hands[daiso];
    const i = hand.findIndex((c) => c.type === 'apply');
    if (i >= 0) { hand[i] = makeCard('smother'); report.daiso = daiso; }
  }
  return report;
}

// 화남돼지집 보호막: 이 상표가 "대상"으로 지정되는 모든 시도를 소유자와 무관하게(중앙 포함) 1회 막는다.
export function checkPigShieldBlocked(state, targetTm) {
  if (!state.abilitiesEnabled || targetTm.ability !== 'pig' || !targetTm.shielded) return null;
  targetTm.shielded = false;
  return { blocked: true, tmId: targetTm.id, text: '🛡️ 화남돼지집 보호막: 대상 지정 차단!' };
}

// 유효 타겟 수정: 저명상표 주장(1R 1차 한정) + 도발(강제) + 남스터치(강탈 업글)
export function modifyTargets(state, actor, card, valid) {
  // 저명상표 주장: 라운드1 1차에서만, 을이 지정한 상표는 갑이 출원으로 가져올 수 없다.
  if (state.renownedClaim && state.round === 1 && state.setIndex === 0 &&
      card.type === 'apply' && actor === 'A') {
    valid = valid.filter((t) => t.id !== state.renownedClaim);
  }
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

// 맹한커피 복불복 대상 여부(대상이 상대 소유의 맹한커피 토큰일 때) — 실제 진행은 engine의 미니게임이 담당
export function isCoffeeGambleTarget(state, targetTm, attacker) {
  return targetTm.ability === 'coffee' && holderOf(state, 'coffee') === targetTm.owner && targetTm.owner !== attacker;
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

// 이 카드(플레이어 관점)에 결부된 능력 id 목록 — 카드 좌상단 배지로 표시.
// "이 카드는 능력 때문에 평소와 다르게 동작한다"를 시각적으로 알려준다.
export function cardAbilityIcons(state, player, card) {
  if (!state.abilitiesEnabled) return [];
  const ids = [];
  if (card.type === 'apply' && holderOf(state, 'moms') === player) ids.push('moms');
  if (card.type === 'smother' && holderOf(state, 'dunkin') === player) ids.push('dunkin');
  if (holderOf(state, 'toast') === player) ids.push('toast');
  if ((card.type === 'prove' || card.type === 'cancel') && holderOf(state, 'taunt') === opp(player)) ids.push('taunt');
  return ids;
}
