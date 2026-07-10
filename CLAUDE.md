# 프차야 (MYFRANCHA) — 프랜차이즈 상표 분쟁 카드게임

바닐라 JS. Firebase RTDB 온라인(호스트 권위), PWA, GitHub Pages 배포.

## 파일 지도

- `js/engine.js`, `js/state.js` — 게임 규칙/상태
- `js/abilities.js`, `js/cards.js` — 카드/능력 정의 (콘텐츠 수정은 여기)
- `js/ui.js`(~600줄), `js/animation.js`, `js/theater.js` — 렌더/연출
- `js/online.js`, `js/firebase-config.js` — 온라인 (DB 경로는 앱별 네임스페이스 유지)
- `js/ai.js` — AI 상대 / `js/persistence.js` — 새로고침 복원 / `js/replay.js`, `js/audio.js`
- `service-worker.js` — PWA 캐시

## 규칙

- 온라인 핸드 동기화는 **신뢰 기반 설계**로 문서화된 결정이다(관련 커밋 참조) —
  변경 전 그 결정의 근거를 확인하고, 뒤집을 때는 사용자에게 먼저 물을 것.
- 유명상표(renowned-trademark) 리본/미리보기는 다른 토큰과의 z-order 버그 전례가 있다 —
  토큰 겹침 관련 수정 시 기존 해결 커밋을 먼저 확인.
- SW/캐시/배포/모바일: webgame-ship 스킬 참조.
- 온라인(방/동기화/규칙): firebase-online 스킬 참조.
