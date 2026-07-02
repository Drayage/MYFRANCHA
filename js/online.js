// online.js — Firebase Realtime Database 온라인 대전 준비 레이어.
//
// 지금은 firebase-config.js에 실제 키가 없으므로 "준비중" 안내만 표시한다.
// 사용자가 실제 Firebase 프로젝트 키를 firebase-config.js에 채워 넣으면
// isOnlineConfigured()가 true가 되고, 아래 room 함수들이 실제 Firebase SDK를
// 동적으로 로드해 README에 정의된 구조로 room을 만들고 구독한다:
//   room { players, table, turnState, round, log }
import { FIREBASE_CONFIG, FIREBASE_PLACEHOLDER_KEY } from './firebase-config.js';
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

// room { players: {A: uid|null, B: uid|null}, table: {...}, turnState: {...}, round: n, log: [...] }
export async function createRoom(hostName) {
  if (!isOnlineConfigured()) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const { db, dbMod } = await loadFirebase();
  const roomId = randomRoomId();
  const roomRef = dbMod.ref(db, `rooms/${roomId}`);
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
  const roomRef = dbMod.ref(db, `rooms/${roomId}`);
  const snap = await dbMod.get(roomRef);
  if (!snap.exists()) throw new Error('존재하지 않는 방입니다.');
  await dbMod.update(dbMod.ref(db, `rooms/${roomId}/players`), { B: guestName });
  return snap.val();
}

export async function subscribeRoom(roomId, onChange) {
  const { db, dbMod } = await loadFirebase();
  const roomRef = dbMod.ref(db, `rooms/${roomId}`);
  return dbMod.onValue(roomRef, (snap) => onChange(snap.val()));
}

export async function pushRoomUpdate(roomId, patch) {
  const { db, dbMod } = await loadFirebase();
  await dbMod.update(dbMod.ref(db, `rooms/${roomId}`), patch);
}
