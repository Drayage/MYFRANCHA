// firebase-config.js — 온라인 대전(Firebase Realtime Database) 설정 자리.
//
// 사용법:
// 1. https://console.firebase.google.com 에서 프로젝트 생성 → Realtime Database 활성화.
// 2. 프로젝트 설정 → 일반 → "내 앱" → 웹 앱 추가 후 나오는 설정 객체를 아래
//    FIREBASE_CONFIG에 그대로 붙여넣기(apiKey 등 실제 값으로 교체).
// 3. Realtime Database 규칙(테스트용 예시 — 실제 배포 전 보안 규칙으로 교체 권장):
//    { "rules": { "rooms": { "$roomId": { ".read": true, ".write": true } } } }
//
// apiKey가 아래 플레이스홀더 그대로면 온라인 모드는 "준비중" 안내만 표시되고
// 실제 Firebase 연결은 시도하지 않습니다(오프라인 모드는 이 파일과 무관하게 항상 동작).
export const FIREBASE_CONFIG = {
  apiKey: 'PASTE_YOUR_FIREBASE_API_KEY_HERE',
  authDomain: 'PASTE_YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://PASTE_YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'PASTE_YOUR_PROJECT',
  storageBucket: 'PASTE_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'PASTE_YOUR_SENDER_ID',
  appId: 'PASTE_YOUR_APP_ID',
};

export const FIREBASE_PLACEHOLDER_KEY = 'PASTE_YOUR_FIREBASE_API_KEY_HERE';
