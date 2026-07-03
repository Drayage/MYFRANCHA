// online.js — Firebase Realtime Database 온라인 대전.
//
// 구조: 방을 만든 사람(호스트)이 실제 게임 엔진(engine.js)을 로컬에서 그대로 돌리는
// "호스트 권위" 모델. 상대(게스트)는 매 상태 변화마다 동기화되는 state 스냅샷을 그대로
// 화면에 그리기만 하는 얇은 클라이언트이고, 자기 차례(카드 선택/대상 선택/저명상표 지정)가
// 오면 호스트가 request로 물어보고, 게스트는 로컬 UI(ui.selectCards 등 오프라인과 동일한
// 함수)로 입력을 받아 response로 돌려준다. 그래서 게스트 쪽 카드 선택 화면은 로컬/AI 모드와
// 완전히 같은 컴포넌트를 그대로 쓴다.
//
// room { players, opts, status, state, result, request, response, createdAt }
//   - state: engine.js가 매 갱신 시점마다 통째로 밀어넣는 게임 상태 스냅샷(JSON)
//   - request/response: 호스트→게스트 "네 차례야, 골라줘" 왕복 프로토콜(id로 짝을 맞춤)
//
// 상대 손패(쉬어유/햄부기퀸 능력 포함) 동기화 방식 — 결정사항:
// 아는 사람들끼리 하는 캐주얼 게임이라, 손패를 유저별 전용 경로로 분리해 서버(RTDB 규칙)로
// 숨기는 대신 전체 state를 양쪽에 그대로 동기화하고 로컬모드 가림막과 같은 "신뢰 기반"으로
// 감춘다. 개발자도구로 상대 손패를 미리 볼 수 있다는 트레이드오프를 감수한 선택 — 나중에
// 진짜 히든 정보가 필요해지면 hands를 rooms/{id}/hands/{A,B}로 분리해 uid별 read 규칙을
// 걸고, 능력 발동 시점에만 해당 카드를 공개 경로로 옮기는 방식으로 바꾸면 된다.
import { FIREBASE_CONFIG, FIREBASE_PLACEHOLDER_KEY, DB_NAMESPACE } from './firebase-config.js';

const FIREBASE_APP_SRC = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
const FIREBASE_DB_SRC = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';

let firebaseModules = null; // { app, db, dbMod } 캐시(중복 초기화 방지)

export function isOnlineConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey) && FIREBASE_CONFIG.apiKey !== FIREBASE_PLACEHOLDER_KEY;
}

// Firebase SDK를 CDN에서 동적 로드(실제 키가 있을 때만 호출됨).
async function loadFirebase() {
  if (firebaseModules) return firebaseModules;
  const [{ initializeApp }, dbMod] = await Promise.all([
    import(/* webpackIgnore: true */ FIREBASE_APP_SRC),
    import(/* webpackIgnore: true */ FIREBASE_DB_SRC),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const db = dbMod.getDatabase(app);
  firebaseModules = { app, db, dbMod };
  return firebaseModules;
}

function randomRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
  let out = '';
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// 이 Firebase 프로젝트는 다른 게임과 공유되므로, 이 앱의 모든 경로는 반드시
// DB_NAMESPACE(myfrancha) 하위로만 읽고 쓴다 — 다른 앱의 rooms/... 와 절대 안 겹치게.
const roomPath = (roomId, sub = '') => `${DB_NAMESPACE}/rooms/${roomId}${sub ? `/${sub}` : ''}`;

// ── 방 생성/참가 ──
export async function createRoom(hostName, opts) {
  if (!isOnlineConfigured()) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const { db, dbMod } = await loadFirebase();
  const roomId = randomRoomId();
  const room = {
    players: { A: hostName, B: null },
    opts,
    status: 'waiting', // waiting(게스트 대기) | playing | done
    state: null,
    result: null,
    request: null,
    response: null,
    createdAt: Date.now(),
  };
  await dbMod.set(dbMod.ref(db, roomPath(roomId)), room);
  return roomId;
}

export async function joinRoom(roomId, guestName) {
  if (!isOnlineConfigured()) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const { db, dbMod } = await loadFirebase();
  const snap = await dbMod.get(dbMod.ref(db, roomPath(roomId)));
  if (!snap.exists()) throw new Error('존재하지 않는 방입니다. 코드를 확인해주세요.');
  const room = snap.val();
  if (room.status !== 'waiting') throw new Error('이미 시작되었거나 종료된 방입니다.');
  if (room.players.B) throw new Error('이미 정원이 찬 방입니다.');
  await dbMod.update(dbMod.ref(db, roomPath(roomId, 'players')), { B: guestName });
  return room;
}

export async function subscribeRoom(roomId, onChange) {
  const { db, dbMod } = await loadFirebase();
  const roomRef = dbMod.ref(db, roomPath(roomId));
  const unsub = dbMod.onValue(roomRef, (snap) => onChange(snap.val()));
  return () => unsub();
}

export async function leaveRoom(roomId) {
  try {
    const { db, dbMod } = await loadFirebase();
    await dbMod.remove(dbMod.ref(db, roomPath(roomId)));
  } catch { /* 방이 이미 없거나 네트워크 문제 — 나가기 자체는 계속 진행 */ }
}

// ── 호스트 전용: 게임 시작/상태 동기화/종료 ──
export async function markPlaying(roomId) {
  const { db, dbMod } = await loadFirebase();
  await dbMod.update(dbMod.ref(db, roomPath(roomId)), { status: 'playing' });
}

export async function pushState(roomId, state) {
  const { db, dbMod } = await loadFirebase();
  await dbMod.set(dbMod.ref(db, roomPath(roomId, 'state')), state);
}

// 게스트가 request 응답 직전에 최신 state를 한 번 더 확실히 읽을 때 사용
// (별도 onValue 구독의 순서 보장이 없어 캐시된 state가 살짝 뒤처져 있을 수 있음).
export async function getRoomState(roomId) {
  const { db, dbMod } = await loadFirebase();
  const snap = await dbMod.get(dbMod.ref(db, roomPath(roomId, 'state')));
  return snap.val();
}

export async function markDone(roomId, result) {
  const { db, dbMod } = await loadFirebase();
  await dbMod.update(dbMod.ref(db, roomPath(roomId)), { status: 'done', result });
}

// ── 호스트→게스트 "네 차례야" 요청/응답 왕복 ──
// request에 고유 id를 실어 쓰고, response에 같은 id가 오는 순간까지 기다린다.
let reqSeq = 0;
export async function requestFromGuest(roomId, payload) {
  const { db, dbMod } = await loadFirebase();
  const id = `${Date.now()}-${++reqSeq}`;
  await dbMod.set(dbMod.ref(db, roomPath(roomId, 'request')), { id, ...payload });
  return new Promise((resolve) => {
    const resRef = dbMod.ref(db, roomPath(roomId, 'response'));
    const unsub = dbMod.onValue(resRef, (snap) => {
      const val = snap.val();
      if (val && val.id === id) {
        unsub();
        dbMod.remove(dbMod.ref(db, roomPath(roomId, 'request')));
        dbMod.remove(resRef);
        resolve(val.answer);
      }
    });
  });
}

// ── 게스트 전용: 호스트의 request 구독 + 응답 전송 ──
export async function subscribeRequest(roomId, onRequest) {
  const { db, dbMod } = await loadFirebase();
  const reqRef = dbMod.ref(db, roomPath(roomId, 'request'));
  let lastId = null;
  const unsub = dbMod.onValue(reqRef, (snap) => {
    const val = snap.val();
    if (val && val.id !== lastId) { lastId = val.id; onRequest(val); }
  });
  return () => unsub();
}

export async function answerRequest(roomId, id, answer) {
  const { db, dbMod } = await loadFirebase();
  await dbMod.set(dbMod.ref(db, roomPath(roomId, 'response')), { id, answer });
}
