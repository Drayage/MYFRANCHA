// animation.js — FLIP 기반 상표 이동 애니메이션 엔진
// 순간이동 금지: 모든 소유권 변경은 이 엔진의 move()를 통해 "실제로 이동"한다.

const prefersReduced = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let speed = 1; // 리플레이 속도 배율(1 = 기본)
export function setAnimSpeed(mult) { speed = mult; }

const dur = (ms) => Math.max(1, ms / speed);

// 상표 토큰 DOM 요소
function tokenEl(tmId) {
  return document.querySelector(`[data-tm="${tmId}"]`);
}
function zoneEl(owner) {
  return document.getElementById(`zone-${owner}`);
}

// tmId 상표를 toOwner 영역으로 실제 이동. collision=true면 착지 시 흔들림(뺏기 연출).
export function move(tmId, toOwner, { collision = false } = {}) {
  return new Promise((resolve) => {
    const el = tokenEl(tmId);
    const dest = zoneEl(toOwner);
    if (!el || !dest) { resolve(); return; }

    // First: 현재 위치
    const first = el.getBoundingClientRect();

    // DOM 이동(최종 위치 확정)
    dest.appendChild(el);
    el.dataset.owner = toOwner;

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;

    if (prefersReduced() || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) {
      // 즉시 이동 fallback
      if (collision) flash(dest);
      resolve();
      return;
    }

    const animDur = dur(620);
    const arcHeight = Math.min(120, Math.max(40, Math.abs(dx) * 0.35));
    el.style.zIndex = '50';
    el.classList.add('tm-moving');

    // Invert → Play: 곡선(arc) + lift(scale) + bounce 착지
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1)`,                 offset: 0,    easing: 'ease-in'  },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arcHeight}px) scale(1.25)`, offset: 0.5, easing: 'ease-out' },
        { transform: `translate(0, 12px) scale(1.1)`,                        offset: 0.82 },
        { transform: `translate(0, -6px) scale(0.96)`,                       offset: 0.91 },
        { transform: `translate(0, 0) scale(1)`,                             offset: 1    },
      ],
      { duration: animDur, fill: 'none' }
    );

    // 데드락 방지: finish 이벤트 + 안전 타임아웃 중 먼저 오는 것으로 1회만 resolve.
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.classList.remove('tm-moving');
      el.style.zIndex = '';
      if (collision) {
        el.classList.add('tm-shake');
        flash(dest);
        setTimeout(() => el.classList.remove('tm-shake'), dur(380));
      }
      resolve();
    };
    anim.addEventListener('finish', done);
    setTimeout(done, animDur + 150);
  });
}

// 영역 강조 플래시(충돌/획득)
function flash(zone) {
  zone.classList.add('zone-flash');
  setTimeout(() => zone.classList.remove('zone-flash'), dur(450));
}

// 카드 무효화 등 제자리 흔들림
export function shakeToken(tmId) {
  const el = tokenEl(tmId);
  if (!el) return Promise.resolve();
  el.classList.add('tm-shake');
  return new Promise((r) => setTimeout(() => { el.classList.remove('tm-shake'); r(); }, dur(380)));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, dur(ms)));
