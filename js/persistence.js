// persistence.js — 진행 중인 한 판을 새로고침/재접속 후에도 이어할 수 있게 저장.
// 지금은 localStorage에만 쓰지만, 저장 지점이 이미 "라운드/세트 경계"로 고정돼 있으므로
// 온라인 대전에서는 이 saveCheckpoint 호출부에 room.table/turnState를 같이 갱신하는 코드를
// 추가하기만 하면 된다(engine.js는 online.js를 몰라도 됨 — 이 모듈이 그 경계를 담당).
const KEY = 'francha.checkpoint';

export function saveCheckpoint(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* localStorage 사용 불가(사생활 보호 모드 등) — 이어하기만 못 할 뿐 게임엔 지장 없음 */ }
}

export function loadCheckpoint() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasCheckpoint() {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

export function clearCheckpoint() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* no-op */ }
}
