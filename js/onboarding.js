// onboarding.js — 첫 실행 코치마크 + 규칙 도움말
import { openModal, closeModal } from './ui.js';

const SEEN_KEY = 'francha.coachSeen';

// 규칙 요약 도움말(언제든 ? 버튼으로)
export function showHelp() {
  openModal(`
    <h3>📄 게임 방법</h3>
    <div class="help-body">
      <p><b>목표</b> — 상표 3개를 두고 싸웁니다. 3개를 모두 차지하면 즉시 승리!
      5라운드가 끝나면 상표가 더 많은 쪽이 승리합니다.</p>
      <p><b>상표 위치</b> — 🟢 중앙(공개) / 🔵 갑(A) 소유 / 🔴 을(B) 소유.
      모든 소유 변경은 상표가 <b>실제로 이동</b>하며 일어납니다.</p>
      <p><b>한 라운드</b> — 3세트로 진행: 1차(1장) → 2차(2장) → 3차(2장).
      세트가 끝날 때마다 선플레이어 토큰이 교대됩니다.</p>
      <p><b>카드 4종</b></p>
      <ul>
        <li>📄 <b>출원</b> — 중앙 상표를 내 영역으로</li>
        <li>📑 <b>사실관계증명</b> — 상대 상표를 빼앗아 내 영역으로</li>
        <li>🚫 <b>불사용취소심판</b> — 상대 상표를 중앙으로 리셋</li>
        <li>🗂️ <b>소송뭉개기</b> — 이번 세트 상대 카드 1장 무효</li>
      </ul>
      <p><b>라운드 토큰</b> — 한 라운드 중 상표 2개를 <b>먼저</b> 확보하면 토큰 1개 획득(누적).
      5라운드 후 상표가 동점이면 토큰이 많은 쪽이 승리합니다.</p>
    </div>
    <button id="help-close" class="btn-primary">확인</button>`, (root) => {
    root.querySelector('#help-close').onclick = closeModal;
  });
}

// 첫 실행 시 한 번만 노출되는 코치마크(스킵 가능)
const STEPS = [
  { sel: '#zone-center', text: '여기 중앙에 상표 3개가 공개되어 있어요. 출원으로 가져올 수 있습니다.' },
  { sel: '#zone-A',      text: '🔵 갑(A)의 영역. 내가 차지한 상표가 여기로 이동합니다.' },
  { sel: '#zone-B',      text: '🔴 을(B)의 영역. 상대가 차지한 상표가 모이는 곳이에요.' },
  { sel: '#hand-area',   text: '내 손패에서 카드를 골라 제출합니다. 카드에 마우스를 올리면 효과 설명이 나와요.' },
  { sel: '#hud',         text: '라운드/세트, 선플레이어, 라운드 토큰을 여기서 확인하세요. ? 버튼으로 규칙을 다시 볼 수 있어요.' },
];

export function maybeShowCoachmarks(force = false) {
  if (!force && localStorage.getItem(SEEN_KEY)) return Promise.resolve();
  return runCoach(0);
}

function runCoach(i) {
  return new Promise((resolve) => {
    const step = (idx) => {
      cleanup();
      if (idx >= STEPS.length) {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
        resolve();
        return;
      }
      const target = document.querySelector(STEPS[idx].sel);
      const overlay = document.createElement('div');
      overlay.id = 'coach-overlay';
      overlay.className = 'coach-overlay';
      const r = target ? target.getBoundingClientRect() : { left: 20, top: 20, width: 100, height: 50, bottom: 70 };
      overlay.innerHTML = `
        <div class="coach-hole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
        <div class="coach-tip" style="left:${Math.min(r.left, window.innerWidth - 280)}px;top:${r.bottom + 12}px">
          <p>${STEPS[idx].text}</p>
          <div class="coach-actions">
            <span class="coach-count">${idx + 1} / ${STEPS.length}</span>
            <button id="coach-skip" class="btn-secondary">건너뛰기</button>
            <button id="coach-next" class="btn-primary">${idx + 1 === STEPS.length ? '시작!' : '다음'}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#coach-next').onclick = () => step(idx + 1);
      overlay.querySelector('#coach-skip').onclick = () => {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
        cleanup(); resolve();
      };
    };
    const cleanup = () => document.getElementById('coach-overlay')?.remove();
    step(i);
  });
}
