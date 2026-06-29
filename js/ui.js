// ui.js — 렌더링 및 플레이어 상호작용
import { TOTAL_ROUNDS, PLAYER_LABEL, OWNER } from './config.js';
import { countOwned } from './state.js';

const $ = (id) => document.getElementById(id);

// ── 보드 토큰: 최초 1회만 생성, 이후 이동은 animation.js가 담당 ──
export function buildBoard(state) {
  for (const owner of ['A', 'center', 'B']) $(`zone-${owner}`).innerHTML = '';
  for (const tm of state.trademarks) {
    const el = document.createElement('div');
    el.className = 'tm-token';
    el.dataset.tm = tm.id;
    el.dataset.owner = tm.owner;
    el.innerHTML = `<span class="tm-emoji">${tm.emoji}</span><span class="tm-name">${tm.name}</span>`;
    $(`zone-${tm.owner}`).appendChild(el);
  }
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
}

export function setBanner(text) { $('banner').textContent = text; }

// ── 토스트(결과 설명) ──
export function showToast(text, ms = 1800) {
  const t = document.createElement('div');
  t.className = 'toast';
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
export function selectCards(state, player, count, { peekInfo = null, autoLabel } = {}) {
  return new Promise((resolve) => {
    const hand = state.hands[player];
    const selected = new Set();
    const handEl = $('hand');
    $('hand-title').textContent =
      `${PLAYER_LABEL[player]}(${player}) — 카드 ${count}장 선택`;
    $('peek').textContent = peekInfo ? `👀 상대 예상: ${peekInfo}` : '';
    handEl.innerHTML = '';

    hand.forEach((card) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.dataset.uid = card.uid;
      c.innerHTML = `
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${card.name}</span>
        <span class="card-short">${card.short}</span>
        <span class="card-tip">${card.desc}</span>`;
      c.onclick = () => {
        if (selected.has(card.uid)) {
          selected.delete(card.uid); c.classList.remove('selected');
        } else if (selected.size < count) {
          selected.add(card.uid); c.classList.add('selected');
        }
        $('submit-cards').disabled = selected.size !== count;
        $('submit-cards').textContent =
          selected.size === count ? '제출' : `${selected.size}/${count} 선택`;
      };
      handEl.appendChild(c);
    });

    const btn = $('submit-cards');
    btn.disabled = true;
    btn.textContent = `0/${count} 선택`;
    btn.onclick = () => {
      const chosen = hand.filter((c) => selected.has(c.uid));
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

// ── 소송뭉개기 대상(상대 미처리 카드) 선택 ──
export function selectSmotherTarget(pendingCards, actorLabel) {
  return new Promise((resolve) => {
    if (!pendingCards.length) { resolve(null); return; }
    const html = pendingCards
      .map((p, i) => `<button class="modal-choice" data-i="${i}">상대 카드 #${i + 1}</button>`)
      .join('');
    const buttons = `<button class="modal-choice" data-i="-1">사용 안 함</button>`;
    openModal(`<h3>🗂️ 소송뭉개기</h3><p>${actorLabel}: 무효화할 상대 카드를 고르세요. (내용은 비공개)</p>
      <div class="modal-choices">${html}${buttons}</div>`, (root) => {
      root.querySelectorAll('.modal-choice').forEach((b) => {
        b.onclick = () => { closeModal(); const i = parseInt(b.dataset.i); resolve(i < 0 ? null : i); };
      });
    });
  });
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
