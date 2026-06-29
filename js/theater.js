// theater.js — 연극모드(추가 토글, 기본 OFF)
// 카드 효과 발동 시 갑/을이 유쾌한 대사를 주고받는다.
import { PLAYER_LABEL } from './config.js';
import { sleep } from './animation.js';

// 카드별 대사: actor(공격자) / victim(피해자)
const LINES = {
  apply: {
    actor: [
      '이 브랜드, 오늘부터 내 거야! 📄',
      '출원 완료~ 줄을 잘 서야지!',
      '먼저 깃발 꽂는 사람이 임자라구!',
    ],
    victim: [
      '엥?! 중앙에 있던 게 왜 거기로…',
      '아니 그걸 그렇게 날름?!',
      '치사하게 선수를 치네…',
    ],
  },
  prove: {
    actor: [
      '증거 있어. 원래 이거 내가 먼저 했지! 📑',
      '장부 봐봐, 다 적혀 있다구!',
      '사실관계로 뒤집어 버린다!',
    ],
    victim: [
      '내 거였는데?! 돌려줘!',
      '그 서류 어디서 났어…',
      '으악, 통째로 뺏겼다!',
    ],
  },
  cancel: {
    actor: [
      '안 쓸 거면 내놔! 불사용취소! 🚫',
      '쓰지도 않으면서 갖고만 있었지?',
      '심판 청구! 중앙으로 원위치!',
    ],
    victim: [
      '아 쓰려고 했단 말이야!',
      '잠깐, 그건 좀…',
      '다시 중앙으로… 분하다!',
    ],
  },
  smother: {
    actor: [
      '그 서류… 효력 없는데요? 🗂️',
      '소송 한 방이면 다 뭉개져~',
      '아쉽지만 그 카드, 무효!',
    ],
    victim: [
      '내 카드가 씹혔다고?!',
      '이런 변호사 같으니…',
      '준비 다 했는데 헛수고라니!',
    ],
  },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function bubble(player, text, kind) {
  const zone = document.getElementById(`zone-${player}`);
  const layer = document.getElementById('speech-layer');
  if (!zone || !layer) return;
  const b = document.createElement('div');
  b.className = `speech speech-${player} speech-${kind}`;
  b.textContent = `${PLAYER_LABEL[player]}: ${text}`;
  const r = zone.getBoundingClientRect();
  b.style.left = `${r.left + r.width / 2}px`;
  b.style.top = `${r.top - 8}px`;
  layer.appendChild(b);
  setTimeout(() => b.classList.add('show'), 10);
  setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 300); }, 1600);
}

// 카드 발동 시 호출. theater OFF면 no-op.
export async function say(state, { cardType, actor, victim }) {
  if (!state.theaterEnabled) return;
  const set = LINES[cardType];
  if (!set) return;
  bubble(actor, pick(set.actor), 'actor');
  if (victim && victim !== actor && set.victim) {
    await sleep(550);
    bubble(victim, pick(set.victim), 'victim');
    await sleep(700);
  } else {
    await sleep(900);
  }
}
