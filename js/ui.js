// ui.js — 렌더링 및 플레이어 상호작용
import { TOTAL_ROUNDS, PLAYER_LABEL, OWNER } from './config.js';
import { countOwned } from './state.js';
import { CARD_BEHAVIOR } from './cards.js';
import { ABILITIES, cardAbilityIcons } from './abilities.js';

const cardLabel = (card) => card.display || card.name;

// 카드에 결부된 능력들을 좌상단 작은 배지로 렌더(빈 배열이면 아무것도 안 그림)
// variant: 'hand'(손패 카드, 카드 밖으로 살짝 튀어나옴) | 'reveal'(공개 카드, 순번 배지와 안 겹치게 안쪽)
function abilityBadgesHTML(ids, variant = 'hand') {
  if (!ids.length) return '';
  const cls = variant === 'reveal' ? 'rcard-ab-badges' : 'card-ab-badges';
  const badgeCls = variant === 'reveal' ? 'rcard-ab-badge' : 'card-ab-badge';
  const items = ids.map((id) => {
    const info = ABILITIES[id];
    return `<span class="${badgeCls}" title="${info.name}: ${info.desc}">${info.icon}</span>`;
  }).join('');
  return `<span class="${cls}">${items}</span>`;
}

const $ = (id) => document.getElementById(id);

// ── 보드 토큰: 최초 1회만 생성, 이후 이동은 animation.js가 담당 ──
export function buildBoard(state) {
  for (const owner of ['A', 'center', 'B']) $(`zone-${owner}`).innerHTML = '';
  for (const tm of state.trademarks) {
    const el = document.createElement('div');
    el.className = 'tm-token';
    el.dataset.tm = tm.id;
    el.dataset.owner = tm.owner;
    // 능력 모드 ON이면 상표 우상단에 능력 마커 표시
    const info = state.abilitiesEnabled ? ABILITIES[tm.ability] : null;
    const marker = info
      ? `<span class="tm-ability${info.ruleChange ? ' rule-change' : ''}" data-ability="${tm.ability}" title="${info.name}: ${info.desc}${info.ruleChange ? ' (룰 변경!)' : ''}">${info.icon}</span>`
      : '';
    el.innerHTML = `${marker}<span class="tm-emoji">${tm.emoji}</span><span class="tm-name">${tm.name}</span>`;
    // 능력 모드: 상표 클릭 시 능력을 카드형 말풍선으로 표시
    if (info) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => { e.stopPropagation(); showAbilityCard(tm, info, el); });
    }
    $(`zone-${tm.owner}`).appendChild(el);
  }
}

// 상표 능력을 카드형 말풍선으로 표시(클릭). 화면 아무데나 누르면 닫힘.
let abilityCardEl = null;
export function showAbilityCard(tm, info, anchorEl) {
  hideAbilityCard();
  const card = document.createElement('div');
  card.className = 'ability-card';
  card.innerHTML = `
    <div class="ac-head"><span class="ac-emoji">${tm.emoji}</span>
      <span class="ac-name">${tm.name}</span></div>
    <div class="ac-badge">${info.icon} ${info.name} 능력</div>
    <div class="ac-desc">${info.desc}</div>`;
  document.body.appendChild(card);
  const r = anchorEl.getBoundingClientRect();
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let left = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), window.innerWidth - cw - 8);
  let top = r.top - ch - 12;
  if (top < 8) top = Math.min(r.bottom + 12, window.innerHeight - ch - 8);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  requestAnimationFrame(() => card.classList.add('show'));
  abilityCardEl = card;
  setTimeout(() => document.addEventListener('pointerdown', hideAbilityCard, { once: true }), 0);
}
function hideAbilityCard() {
  if (abilityCardEl) { abilityCardEl.remove(); abilityCardEl = null; }
}

// 능력 발동 시 해당 상표 마커를 잠깐 강조
export function flashAbility(abilityId) {
  const m = document.querySelector(`.tm-ability[data-ability="${abilityId}"]`);
  if (!m) return;
  m.classList.add('ability-active');
  setTimeout(() => m.classList.remove('ability-active'), 1600);
}

// 리플레이용: 모든 토큰을 중앙으로 즉시 복귀
export function resetTokensToCenter(state) {
  for (const tm of state.trademarks) {
    const el = document.querySelector(`[data-tm="${tm.id}"]`);
    if (el) { $('zone-center').appendChild(el); el.dataset.owner = 'center'; }
  }
}

// ── HUD ──
export function updateHUD(state) {
  $('hud-round').textContent = `라운드 ${state.round} / ${TOTAL_ROUNDS}`;
  const setName = ['1차(1장)', '2차(2장)', '3차(2장)'][state.setIndex] || '-';
  $('hud-set').textContent = `세트 ${setName}`;
  $('hud-first').textContent = `선플레이어: ${PLAYER_LABEL[state.firstPlayer]}(${state.firstPlayer})`;
  $('hud-token-a').textContent = `${PLAYER_LABEL.A}(A) 토큰 ${state.roundTokens.A}`;
  $('hud-token-b').textContent = `${PLAYER_LABEL.B}(B) 토큰 ${state.roundTokens.B}`;
  $('hud-own-a').textContent = `상표 ${countOwned(state, 'A')}`;
  $('hud-own-b').textContent = `상표 ${countOwned(state, 'B')}`;
  // 선플레이어 영역 라벨에 (선) 마커
  $('first-A').style.visibility = state.firstPlayer === 'A' ? 'visible' : 'hidden';
  $('first-B').style.visibility = state.firstPlayer === 'B' ? 'visible' : 'hidden';
  // 사람/AI 진영 표시(AI 모드)
  if (state.mode === 'ai') {
    $('side-A').textContent = state.humanSide === 'A' ? '나' : 'AI';
    $('side-B').textContent = state.humanSide === 'B' ? '나' : 'AI';
    $('side-A').className = `side-badge ${state.humanSide === 'A' ? 'me' : 'ai'}`;
    $('side-B').className = `side-badge ${state.humanSide === 'B' ? 'me' : 'ai'}`;
  } else {
    $('side-A').textContent = ''; $('side-B').textContent = '';
  }
}

export function setBanner(text) { $('banner').textContent = text; }

// ── 토스트(결과 설명) ── 기본은 1줄, multi=true면 여러 줄 허용(능력 설명 등)
export function showToast(text, ms = 1800, { multi = false } = {}) {
  const t = document.createElement('div');
  t.className = multi ? 'toast toast-multi' : 'toast';
  t.textContent = text;
  $('toast-layer').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ── 패스앤플레이 가림막 ──
export function showCover(player) {
  return new Promise((resolve) => {
    const cover = $('cover');
    cover.innerHTML = `
      <div class="cover-inner">
        <div class="cover-emoji">🙈</div>
        <h2>${PLAYER_LABEL[player]}(${player}) 차례</h2>
        <p>기기를 ${PLAYER_LABEL[player]}에게 넘겨주세요.<br>상대에게 손패가 보이지 않게!</p>
        <button id="cover-go" class="btn-primary">내 차례 시작</button>
      </div>`;
    cover.classList.add('show');
    $('cover-go').onclick = () => { cover.classList.remove('show'); resolve(); };
  });
}

// ── 손패에서 카드 N장 선택 ──
// peekInfo: 맹한커피로 미리 본 상대 카드 정보(문자열)
export function selectCards(state, player, count, { peekInfo = null } = {}) {
  return new Promise((resolve) => {
    const hand = state.hands[player];
    const orderSel = [];                 // 선택 순서(uid 배열) = 제출/턴 순서
    const handEl = $('hand');
    const isFirst = player === state.firstPlayer;     // 이번 세트 선플레이어 여부
    // 선택 위치(슬롯/턴 k)의 전체 처리 순번: 슬롯마다 선=2k+1, 후=2k+2
    const seqNo = (k) => 2 * k + (isFirst ? 1 : 2);
    $('hand-title').textContent =
      `${PLAYER_LABEL[player]}(${player}) — 카드 ${count}장 선택${count > 1 ? ' (누른 순서대로 처리)' : ''}`;
    $('peek').textContent = peekInfo ? `👀 상대 예상: ${peekInfo}` : '';
    handEl.innerHTML = '';

    // 보드 대상 영역 은은하게 미리보기 (개별 상표가 아니라 영역 단위)
    const clearPreview = () => document.querySelectorAll('.zone-drop.zone-preview')
      .forEach((e) => e.classList.remove('zone-preview'));
    const previewZones = (card) => {
      const opp = player === 'A' ? 'B' : 'A';
      switch (card.type) {
        case 'apply': return ['center'];
        case 'prove': return [opp];
        case 'cancel': return [opp, 'center'];
        default: return [];               // 소송뭉개기 등은 영역 강조 없음
      }
    };
    const showPreview = (card) => {
      clearPreview();
      previewZones(card).forEach((z) => $(`zone-${z}`)?.classList.add('zone-preview'));
    };

    const renderBadges = () => {
      handEl.querySelectorAll('.card').forEach((c) => {
        const pos = orderSel.indexOf(c.dataset.uid);
        c.classList.toggle('selected', pos >= 0);
        const badge = c.querySelector('.order-badge');
        if (pos >= 0) { badge.textContent = seqNo(pos); badge.style.display = 'flex'; }
        else badge.style.display = 'none';
      });
      const btn = $('submit-cards');
      btn.disabled = orderSel.length !== count;
      btn.textContent = orderSel.length === count ? '제출' : `${orderSel.length}/${count} 선택`;
    };

    hand.forEach((card) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.dataset.uid = card.uid;
      c.innerHTML = `
        <span class="order-badge" style="display:none"></span>
        ${abilityBadgesHTML(cardAbilityIcons(state, player, card))}
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${cardLabel(card)}</span>
        <span class="card-short">${card.short}</span>
        <span class="card-tip">${card.desc}</span>`;
      c.onmouseenter = () => showPreview(card);
      c.onmouseleave = clearPreview;
      c.onclick = () => {
        const i = orderSel.indexOf(card.uid);
        if (i >= 0) orderSel.splice(i, 1);
        else if (orderSel.length < count) orderSel.push(card.uid);
        renderBadges();
        // 다시 눌러 취소하면 영역 강조도 사라지게
        if (orderSel.includes(card.uid)) showPreview(card);
        else clearPreview();
      };
      handEl.appendChild(c);
    });
    renderBadges();

    const btn = $('submit-cards');
    btn.onclick = () => {
      // 선택 순서대로 반환 → 제출 슬롯(턴) 순서가 됨
      const chosen = orderSel.map((uid) => hand.find((c) => c.uid === uid));
      clearPreview();
      handEl.innerHTML = '';
      $('hand-title').textContent = '';
      $('peek').textContent = '';
      btn.disabled = true; btn.textContent = '제출';
      resolve(chosen);
    };
  });
}

// ── 보드에서 상표 1개 선택(유효 대상 하이라이트) ──
export function selectTrademark(validTms, promptText) {
  return new Promise((resolve) => {
    setBanner(promptText);
    const handlers = [];
    validTms.forEach((tm) => {
      const el = document.querySelector(`[data-tm="${tm.id}"]`);
      if (!el) return;
      el.classList.add('targetable');
      const h = () => {
        validTms.forEach((t) => {
          const e = document.querySelector(`[data-tm="${t.id}"]`);
          e?.classList.remove('targetable');
        });
        handlers.forEach(({ e, fn }) => e.removeEventListener('click', fn));
        resolve(tm);
      };
      el.addEventListener('click', h);
      handlers.push({ e: el, fn: h });
    });
  });
}

// ── 카드 공개 영역(세트 단위 동시 공개) ──
const reduced = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// slots: {A:[slot..], B:[slot..]}, order: [[player, slotIdx], ...] (처리 순서).
// 처리 순서대로 가로 시퀀스 + 화살표 + 순번 배지로 공개 순서를 보여준다.
export function showRevealArea(state, slots, order) {
  const area = $('reveal-area');
  area.innerHTML = '';
  area.classList.add('show');
  order.forEach(([player, slotIdx], seq) => {
    if (seq > 0) {
      const arrow = document.createElement('div');
      arrow.className = 'reveal-arrow';
      arrow.textContent = '→';
      area.appendChild(arrow);
    }
    const role = player === state.firstPlayer ? '선' : '후';
    const card = slots[player][slotIdx]?.card;
    area.appendChild(makeRevealCard(state, player, slotIdx, card, role, seq + 1));
  });
}

function makeRevealCard(state, player, slot, card, role, seqNo) {
  const el = document.createElement('div');
  el.className = 'rcard';
  el.dataset.player = player;
  el.dataset.slot = slot;
  const badges = card ? abilityBadgesHTML(cardAbilityIcons(state, player, card), 'reveal') : '';
  el.innerHTML = `
    <div class="rcard-seq">${seqNo}</div>
    <div class="rcard-who ${player === 'A' ? 'who-a' : 'who-b'}">${PLAYER_LABEL[player]}·턴${slot + 1}·${role}</div>
    <div class="rcard-inner">
      <div class="rcard-face rcard-back">🏷️</div>
      <div class="rcard-face rcard-front">
        ${badges}
        <span class="rcard-emoji">${card ? card.emoji : ''}</span>
        <span class="rcard-name">${card ? cardLabel(card) : ''}</span>
      </div>
    </div>
    <div class="rcard-stamp">무효</div>`;
  return el;
}

// 공개 카드를 왼쪽부터 주르륵 순차 플립
export function flipRevealAll() {
  return new Promise((resolve) => {
    const cards = [...document.querySelectorAll('#reveal-area .rcard')];
    const stagger = reduced() ? 0 : 170;
    cards.forEach((c, i) => setTimeout(() => c.classList.add('flipped'), i * stagger));
    const total = reduced() ? 0 : (cards.length - 1) * stagger + 700;
    setTimeout(resolve, total);
  });
}

export function markRevealNullified(player, slot) {
  document.querySelector(`#reveal-area .rcard[data-player="${player}"][data-slot="${slot}"]`)
    ?.classList.add('nullified');
}

// 소송뭉개기처럼 이미 효과가 적용된 카드를 "사용됨"으로 표시
export function markRevealUsed(player, slot) {
  document.querySelector(`#reveal-area .rcard[data-player="${player}"][data-slot="${slot}"]`)
    ?.classList.add('used');
}

export function highlightRevealCard(player, slot) {
  document.querySelectorAll('#reveal-area .rcard.active').forEach((c) => c.classList.remove('active'));
  document.querySelector(`#reveal-area .rcard[data-player="${player}"][data-slot="${slot}"]`)
    ?.classList.add('active');
}

export function clearRevealArea() {
  const area = $('reveal-area');
  area.classList.remove('show');
  area.innerHTML = '';
}

// ── 범용 모달 ──
export function openModal(html, wire) {
  const layer = $('modal-layer');
  layer.innerHTML = `<div class="modal">${html}</div>`;
  layer.classList.add('show');
  if (wire) wire(layer);
}
export function closeModal() {
  const layer = $('modal-layer');
  layer.classList.remove('show');
  layer.innerHTML = '';
}

// ── 라운드/게임 종료 모달 ──
export function showRoundEnd(state) {
  return new Promise((resolve) => {
    const tokenMsg = state.roundSecuredTwo
      ? `${PLAYER_LABEL[state.roundSecuredTwo]}가 먼저 상표 2개를 확보해 라운드 토큰 획득! 🏁`
      : '이번 라운드는 토큰 획득자가 없습니다.';
    openModal(`
      <h3>라운드 ${state.round} 종료</h3>
      <p>${tokenMsg}</p>
      <p>현재 상표 — ${PLAYER_LABEL.A}: ${countOwned(state, 'A')} · 중앙: ${countOwned(state, OWNER.CENTER)} · ${PLAYER_LABEL.B}: ${countOwned(state, 'B')}</p>
      <p>라운드 토큰 — ${PLAYER_LABEL.A}: ${state.roundTokens.A} · ${PLAYER_LABEL.B}: ${state.roundTokens.B}</p>
      <button id="round-next" class="btn-primary">다음 라운드</button>`, (root) => {
      root.querySelector('#round-next').onclick = () => { closeModal(); resolve(); };
    });
  });
}

export function showGameOver(state, result, { onReplay, onHome }) {
  const reasonText = {
    instant: '상표 3개를 모두 차지했습니다!',
    trademarks: '더 많은 상표를 차지했습니다.',
    tokens: '상표 동점 — 라운드 토큰이 더 많습니다.',
    'last-token': '완전 동점 — 마지막 라운드 토큰 보유로 승리.',
    draw: '완전 무승부!',
  }[result.reason] || '';
  const winLine = result.winner
    ? `🏆 ${PLAYER_LABEL[result.winner]}(${result.winner}) 승리!`
    : '🤝 무승부';
  openModal(`
    <h3>게임 종료</h3>
    <p class="big-win">${winLine}</p>
    <p>${reasonText}</p>
    <p>최종 상표 — ${PLAYER_LABEL.A}: ${countOwned(state, 'A')} · ${PLAYER_LABEL.B}: ${countOwned(state, 'B')}</p>
    <div class="modal-choices">
      <button id="go-replay" class="btn-primary">▶ 리플레이 보기</button>
      <button id="go-home" class="btn-secondary">처음으로</button>
    </div>`, (root) => {
    root.querySelector('#go-replay').onclick = () => { closeModal(); onReplay(); };
    root.querySelector('#go-home').onclick = () => { closeModal(); onHome(); };
  });
}

export { $ };
