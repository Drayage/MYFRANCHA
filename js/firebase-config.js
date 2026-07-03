// firebase-config.js — 온라인 대전(Firebase Realtime Database) 설정.
//
// 이 Firebase 프로젝트(frenzy-49857)는 다른 게임들과 함께 쓰는 공유 프로젝트다.
// 실제 DB 규칙이 games/ 경로만 열려있다:
//   { "rules": { "games": { ".read": true, ".write": true } } }
// 그래서 이 앱의 모든 데이터는 그 games/ 아래에 다시 이 앱 전용 하위 네임스페이스를
// 둬서 쓴다(`games/myfrancha/rooms/...`) — 다른 게임의 데이터와 절대 안 겹치게
// 이 네임스페이스 규칙을 유지할 것. games/ 바깥 경로는 규칙상 막혀서 애초에 안 됨.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDnEYQRvb16iW0HZyq4bgrvtnPysDbeFBc',
  authDomain: 'frenzy-49857.firebaseapp.com',
  databaseURL: 'https://frenzy-49857-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'frenzy-49857',
  storageBucket: 'frenzy-49857.firebasestorage.app',
  messagingSenderId: '256453631137',
  appId: '1:256453631137:web:b8badcfd42bd735944a4e0',
};

// 이 앱 전용 네임스페이스 — games/ 규칙이 열린 경로 안에서, 같은 프로젝트를 쓰는
// 다른 게임과 데이터가 섞이지 않도록 모든 읽기/쓰기 경로를 반드시 이 하위로 둔다.
export const DB_NAMESPACE = 'games/myfrancha';

export const FIREBASE_PLACEHOLDER_KEY = 'PASTE_YOUR_FIREBASE_API_KEY_HERE';
