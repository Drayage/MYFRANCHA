// online.js — Firebase Realtime Database 온라인 대전 준비 레이어.
//
// firebase-config.js에 실제 키가 채워지면 isOnlineConfigured()가 true가 되고,
// 아래 room 함수들이 Firebase SDK를 동적으로 로드해 room을 만들고 구독한다:
//   room { players, table, turnState, round, log }
//
// 상대 손패(쉬어유/햄부기퀸 능력 포함) 동기화 방식 — 결정사항:
// 아는 사람들끼리 하는 캐주얼 게임이라, 손패를 유저별 전용 경로로 분리해 서버(RTDB 규칙)로
// 숨기는 대신 전체 state를 양쪽에 그대로 동기화하고 로컬모드 가림막과 같은 "신뢰 기반"으로
// 감춘다. 개발자도구로 상대 손패를 미리 볼 수 있다는 트레이드오프를 감수한 선택 — 나중에
// 진짜 히든 정보가 필요해지면 hands를 rooms/{id}/hands/{A,B}로 분리해 uid별 read 규칙을
// 걸고, 능력 발동 시점에만 해당 카드를 공개 경로로 옮기는 방식으로 바꾸면 된다.
import { FIREBASE_CONFIG, FIREBASE_PLACEHOLDER_KEY, DB_NAMESPACE } from './firebase-config.js';
import * as ui from './ui.js';

const FIREBASE_APP_SRC = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
const FIREBASE_DB_SRC = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';

let firebaseModules = null; // { app, db } 캐시(중복 초기화 방지)

export function isOnlineConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey) && FIREBASE_CONFIG.apiKey !== FIREBASE_PLACEHOLDER_KEY;
}

export function showOnlineComingSoon() {
  if (isOnlineConfigured()) {
    // 실제 키가 채워진 뒤에도 방 만들기/참가 UI는 별도 작업으로 이어서 구현 예정.
    ui.openModal(
      `<h3>🌐 온라인 대전</h3>
       <p>Firebase 연결은 준비됐지만, 방 만들기/참가 화면은 아직 연결 중입니다.</p>
       <div class="modal-choices"><button class="modal-choice" data-act="close">닫기</button></div>`,
      (layer) => {
        layer.querySelector('[data-act="close"]').onclick = () => ui.closeModal();
      }
    );
    return;
  }
  ui.openModal(
    `<h3>🌐 온라인 대전 (준비중)</h3>
     <p style="color:var(--muted);font-size:.9rem;line-height:1.5;">
       아직 온라인 서버 키가 설정되지 않았습니다.<br/>
       지금은 🤖 AI 대전과 👥 로컬 패스앤플레이로 즐겨주세요!<br/>
       (Firebase 키가 준비되면 이 화면에서 바로 대전방을 만들 수 있어요.)
     </p>
     <div class="modal-choices"><button class="modal-choice" data-act="close">확인</button></div>`,
    (layer) => {
      layer.querySelector('[data-act="close"]').onclick = () => ui.closeModal();
    }
  );
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
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

// 이 Firebase 프로젝트는 다른 게임과 공유되므로, 이 앱의 모든 경로는 반드시
// DB_NAMESPACE(myfrancha) 하위로만 읽고 쓴다 — 다른 앱의 rooms/... 와 절대 안 겹치게.
const roomPath = (roomId, sub = '') => `${DB_NAMESPACE}/rooms/${roomId}${sub ? `/${sub}` : ''}`;

// room { players: {A: uid|null, B: uid|null}, table: {...}, turnState: {...}, round: n, log: [...] }
export async function createRoom(hostName) {
  if (!isOnlineConfigured()) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const { db, dbMod } = await loadFirebase();
  const roomId = randomRoomId();
  const roomRef = dbMod.ref(db, roomPath(roomId));
  const room = {
    players: { A: hostName, B: null },
    table: null,
    turnState: null,
    round: 1,
    log: [],
    createdAt: Date.now(),
  };
  await dbMod.set(roomRef, room);
  return roomId;
}

export async function joinRoom(roomId, guestName) {
  if (!isOnlineConfigured()) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const { db, dbMod } = await loadFirebase();
  const roomRef = dbMod.ref(db, roomPath(roomId));
  const snap = await dbMod.get(roomRef);
  if (!snap.exists()) throw new Error('존재하지 않는 방입니다.');
  await dbMod.update(dbMod.ref(db, roomPath(roomId, 'players')), { B: guestName });
  return snap.val();
}

export async function subscribeRoom(roomId, onChange) {
  const { db, dbMod } = await loadFirebase();
  const roomRef = dbMod.ref(db, roomPath(roomId));
  return dbMod.onValue(roomRef, (snap) => onChange(snap.val()));
}

export async function pushRoomUpdate(roomId, patch) {
  const { db, dbMod } = await loadFirebase();
  await dbMod.update(dbMod.ref(db, roomPath(roomId)), patch);
}
