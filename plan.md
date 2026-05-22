# Retake Prototype — 분석 & iOS 디플로이 계획

본 문서는 `retake-web-prototype` 레포의 (1) 전체 구조 개요, (2) 코드 흐름,
(3) 에러/보안 리스크 분석, (4) iOS 백엔드 디플로이 단계를 정리한다.

---

## 1. 전체 구조 개요

**Retake**는 모바일 우선의 카메라/프레임 공유 프로토타입.
Vite + React 18 + React Router 6, Vercel API Routes + Vercel Blob 스토리지로 구성된 단일 SPA.

### 기술 스택
- **프론트엔드**: React 18.3, react-router-dom 6.26, Vite 5.4
- **백엔드**: Vercel Serverless Functions (`api/`), Vercel Blob, Airtable (이메일 가입)
- **개발 서버**: `npm run dev:https` → `https://192.168.0.72:5174` (모바일 Safari 테스트용 로컬 인증서 `.cert/`)

### 레포 구조
```
api/                     Vercel serverless 엔드포인트 (6개)
src/
  App.jsx, main.jsx      라우터 진입점
  components/ui/         공용 UI 프리미티브 (GlassSurface, IconButton 계열, Modal, Toast…)
  features/
    editor/              ★ 모든 카메라/캔버스 공용 로직 (inviter+invitee 공유)
      components/        24개 (FrameCanvas, StickerPanel, RetakeCamera*…)
      hooks/             11개 (useCanvasDrawing, useStickerSystem, useRetakeCamera…)
      utils/             canvas/imageProcessing/smartSelection/transformGesture
    inviter/             프레임 작가 플로우 (InviterPage.jsx 2558줄)
    invitee/             초대 받은 사람 플로우 (InviteePage.jsx 1257줄)
  hooks/                 usePreventBrowserZoom
  lib/                   api.js, canvas.js, routes.js
  styles/                토큰 → base → glass/brand/controls/overlays/camera 레이어드 CSS
docs/                    app-architecture, design-system, prototype-ledger
```

루트에는 `landing.html`, `marketing.html`, `index-*.html` 같은 레거시 정적 페이지가 남아 있음.
현재 작업 진실의 출처는 `src/` + `docs/`.

---

## 2. 두 개의 주요 플로우

### A. Inviter (프레임 제작자) — `src/features/inviter/InviterPage.jsx`

상태 머신 (`src/features/inviter/state.js`):
```
INTRO → EDITING → TOOL_ACTIVE → STEP3_LIVE
                              → STEP3_PHOTO_REVIEW
                              → STEP3_VIDEO_REVIEW
                              → STEP3_SAVED_FRAMES
```
이 값은 화면 루트에 `data-flow-state`로 노출되어 CSS/분석에서 단계별로 분기 가능.

### B. Invitee (초대받은 사람) — `src/features/invitee/InviteePage.jsx`

상태 머신 (`src/features/invitee/state.js`):
```
LOADING → ERROR
        → ACCEPT (카메라 권한 게이트)
        → CAMERA_LIVE → PHOTO_REVIEW / VIDEO_REVIEW → SUBMITTED
```
`/invite/:inviteId`로 진입, 서버에서 invite JSON 받아 프레임을 라이브 뷰파인더 위에 합성.

두 플로우는 `features/editor/`의 카메라/캔버스/스티커/드로잉/텍스트 컴포넌트와 훅을 **공유**.

---

## 3. 코드 흐름 (Inviter → Invitee 엔드 투 엔드)

```
[Inviter]
1. IntroCard → 사진 입력 (PhotoInputs) + 캔버스 편집
   ├─ useCanvasDrawing       그리기/지우기/펜
   ├─ useStickerSystem       스티커 추가·변형·정제 (1604줄, 최대 hook)
   ├─ useTextTool            텍스트 오버레이
   ├─ useMediaTransform      배경 사진 팬/줌
   ├─ useInviterLayerStack   레이어 순서 관리
   ├─ useHistory             undo/redo
   └─ useMagicEraser+smartSelection  이미지 영역 자동 선택 제거

2. 완성 → drawContainedImageWithBackground(canvas.js)로 PNG dataURL 생성
3. lib/api.js → uploadFrame() → POST /api/upload-frame
       ├ DEV 로컬: dataURL 그대로 반환
       └ PROD: @vercel/blob put() → blob.url 리턴 (private store면 /api/frame 프록시)

4. STEP3 (Retake 촬영):
   - useRetakeCamera (628줄): getUserMedia, 페이싱 모드, 줌, 토치, 더블탭, MediaRecorder
   - RetakeCameraStage + Overlays(카운트다운/녹화 스트로크/플래시)
   - 촬영물 + 프레임을 합성 → 저장(localStorage) 또는 공유

5. 공유 클릭 → createInvite({frameUrl, frameName, username})
       → POST /api/invite → randomBytes(12) base64url id → blob put invites/{id}.json
       → inviteUrl 반환 → 시스템 share sheet

[Invitee]
1. /invite/:inviteId
2. getInvite({id}) → GET /api/invite?id=… → blob에서 invites/{id}.json 스트림 → frameUrl
3. InviteAcceptCard → 카메라 권한 요청
4. CAMERA_LIVE: 동일한 useRetakeCamera + frame 오버레이
5. 촬영 → uploadRetakeMedia(): @vercel/blob/client `upload()`
       → POST /api/blob-upload (handleUpload) → 클라이언트가 직접 Blob에 PUT
       → 콘텐츠 타입/확장자 화이트리스트로 검증
6. recordRetake() → POST /api/retake → retakes/{inviteId}/{id}.json 기록
7. SubmittedRetakeBanner
```

### API 6개 요약
| 엔드포인트 | 메서드 | 역할 |
|---|---|---|
| `api/signup.js` | POST | 이메일을 Airtable에 기록 |
| `api/upload-frame.js` | POST | dataURL → Vercel Blob (public/private 자동 폴백) |
| `api/frame.js` | GET | private blob URL 프록시 (auth 추가) |
| `api/invite.js` | POST/GET | invite JSON 생성/조회, 12 byte id |
| `api/blob-upload.js` | POST | 클라이언트 직접 업로드용 토큰 발급 (handleUpload) |
| `api/retake.js` | POST | 제출된 retake 메타데이터 기록 |

`lib/api.js`는 **DEV에서 `VITE_API_ORIGIN` 미설정이면** 모든 호출을 localStorage 기반 가짜 백엔드로
우회 — 오프라인 프로토타이핑이 쉬움.

---

## 4. 디자인 시스템 (`docs/design-system.md` 강조 사항)

CSS 레이어 순서:
`tokens.css` (시멘틱 변수) → `base.css` → `glass.css / brand.css / controls.css / overlays.css / camera.css`
→ route별 `inviter.css / invitee.css`.

컴포넌트 계층:
- `IconButton` ← `GlassIconButton` / `SolidIconButton`
- `Surface` ← `GlassSurface` (반투명 툴바/플로팅) / `SolidSurface` (글래스 내부 컨트롤)
- Bedstead 폰트 + 노란색 brand 모먼트

---

## 5. 에러 / 보안 리스크 분석

### A. 보안 / 개인정보 관련 (가장 시급)

#### 🔴 1. 인증·인가가 전혀 없음
- 모든 API가 누구나 호출 가능. 예시:
  - `api/upload-frame.js` — 5MB 이미지를 **누구나** 무한 업로드 가능 → Blob 스토리지 비용 폭탄
  - `api/blob-upload.js` — `inviteId` 형식만 맞으면 토큰 발급 → 임의 invite 슬롯에 미디어 PUT 가능
  - `api/retake.js` — invite 존재 확인 없이 retake 메타를 무제한 추가
  - `api/invite.js` — username/frameName을 그대로 신뢰. invite 본문에 누가 만들었는지 흔적 없음
- **Rate limiting 0건**, CAPTCHA 0건

#### 🔴 2. PII가 사실상 평문·공개로 저장
- Vercel Blob을 `access: 'public'`으로 사용 (frame, retake JSON 모두)
- 누군가 사진과 username이 들어간 invite/retake JSON URL을 추측·유출하면
  **공개 인터넷에서 접근 가능**
- Invite ID가 `randomBytes(12).toString('base64url')` (96 bit) — 추측은 어렵지만,
  한 번 새면 영구 공개
- `api/signup.js` — 이메일이 Airtable로 평문 저장,
  **HTTPS 외 어떤 동의 메커니즘도 없음** (GDPR/PIPA 위반 소지)

#### 🟠 3. CORS / Origin 정책 부재
- 어느 API도 `Origin` 검사 안 함
- 임의 사이트에서 fetch 가능 → CSRF·악성 사이트 통한 토큰 발급 가능

#### 🟠 4. 입력 검증 구멍
- `api/upload-frame.js:26` — `frameDataUrl.startsWith('data:image/')`만 체크
- `data:image/svg+xml;base64,...`로 **SVG 안에 JS** 삽입 → public Blob URL로 서빙되면 XSS 가능
- `api/blob-upload.js:27` — SVG는 화이트리스트 밖이지만, 이미지 디멘션·실제 매직바이트는 검사 안 함
- `frameUrl`이 `/api/frame?...`이면 통과 — `/api/frame?url=`은 **오픈 리다이렉트/SSRF 비슷한 위험**
- `api/invite.js` — `allowOverwrite: false`라 같은 ID 충돌은 막지만,
  `frameName/username`은 검열 없음 → 욕설·악성 URL 임베드 가능

#### 🟡 5. 비밀이 빠지면 500 + 상세 메시지
- `BLOB_READ_WRITE_TOKEN` 없을 때 detail에 환경변수 이름을 그대로 노출
- 운영에선 일반화 권장

### B. 런타임 안정성 / 메모리 누수

#### 🟠 1. 카메라/녹화 리소스
- `useRetakeCamera.js`에 ref가 22개
  (`streamRef`, `recorderRef`, `videoObjectUrlRef`, `flashTimerRef`, `recordRafRef`, `countdownTimersRef`…)
- `stopCamera()` 안에서 `recorderRef` 정리 코드는 없음
  (state는 reset되지만 MediaRecorder 인스턴스가 살아 있을 수 있음)
- 페이지 unmount 시 cleanup 훅이 모든 ref를 청소하는지 검증 필요
- `URL.createObjectURL`을 `InviteePage.jsx:60` `downloadBlob`처럼 여러 곳에서 만드는데,
  revoke timeout이 1초로 짧음. 큰 비디오에서 다운로드 실패 가능

#### 🟠 2. iOS Safari 특이사항
- `getUserMedia`는 **HTTPS 필수** + **사용자 제스처 직후만** 권한 프롬프트가 안정적
- iOS는 `MediaRecorder` 지원이 16.4+부터
  `STEP3_VIDEO_TYPES`에 `video/mp4`가 있지만 iOS Safari에서 `MediaRecorder.isTypeSupported` 실측 필요
- `playsInline` 누락하면 비디오가 풀스크린으로 점프
  → `useRetakeCamera.js:150`에서 설정됨 ✓
- 백그라운드 진입 시 stream이 정지되는데,
  visibilitychange 리스너로 restart하는 코드가 보이지 않음
  → "화면 잠갔다 깨우면 검은 화면" 버그

#### 🟡 3. localStorage 의존
- `retake.savedFrames.v1`, `retake.localInvites.v1`, `retake.localRetakes.v1` —
  Safari Private 모드/스토리지 초과 시 throw
- try/catch가 일부만 있음
- Safari ITP가 7일 후 localStorage를 비울 수 있음 → 저장 프레임 분실

#### 🟡 4. 큰 파일·복잡한 상태
- `InviterPage.jsx` 2558줄 한 컴포넌트
- setState가 많아 리렌더 폭주, 카메라 stage 떨림 위험
- 메모이제이션 누락 가능성 높음
- `useStickerSystem.js` 1604줄 — undo/redo 히스토리와 함께 큰 객체를 deep clone하고 있을 가능성,
  모바일에서 GC 끊김

#### 🟡 5. 네트워크 실패 처리
- `lib/api.js` `requestJson`은 단순 throw. 사용처에서 retry/backoff 없음
- 모바일 환승 시 invite 로드 실패 → ERROR 상태 영구
- `uploadRetakeMedia`는 클라이언트가 Blob 직업로드 → 중간 실패 시 부분 업로드/orphan blob 발생

### C. 동시성·UX 버그 가능성
- 빠른 더블탭 / 카운트다운 중 모드 전환 시 `countdownTimersRef` race
  모드 전환 직전 cancel하는지 확인 필요
- 카메라 facing 전환(`startCamera`) 중 또 누르면
  `stopCamera` → `requestRetakeCameraStream` 두 번 진입. mutex 없음
- Blob 업로드 진행 중 사용자가 `Exit` → orphan 업로드

---

## 6. iOS 백엔드 디플로이 단계

> 전제: 현재는 **웹 SPA + Vercel Functions**.
> 사용자가 원하는 건 "iOS용 백엔드". 두 경로가 있다:
>
> 1. **PWA / WebView 래핑** (Capacitor) — 코드 90% 재사용, App Store 배포 가능. 가장 빠름
> 2. **네이티브 iOS 앱 + 백엔드 API 분리** — Swift/SwiftUI 새로 작성, 백엔드만 공유
>
> 아래는 어느 경로든 공통으로 필요한 **백엔드 정비** 단계.
> 가벼움·보안·이음매 없음을 우선.

### 단계 1. 백엔드를 "프로토타입"에서 "프로덕션"으로 승격

#### 1-1. 사용자 / 인증 도입 (필수)
- **Supabase Auth** (또는 Firebase Auth) 추천
- 이유:
  - Apple Sign-in (App Store 정책상 SNS 로그인 있으면 의무) 즉시 지원
  - 무료 티어 충분, 가벼움, JWT 기반 → Vercel Functions에서 검증만 추가
- iOS는 `ASAuthorizationAppleIDProvider`로 ID token 받기 → 백엔드에 전달 → 세션
- 결과: 모든 API 첫 줄에 `const user = await verifyJWT(req)` 게이트

#### 1-2. 데이터 모델을 Blob JSON → DB로 이전
- Blob JSON은 프로토타입엔 좋지만 검색·소유권·삭제·필터링 불가
- Supabase Postgres (또는 Vercel Postgres):
  ```
  users(id, apple_sub, created_at)
  frames(id, owner_id, blob_url, name, created_at)
  invites(id, frame_id, creator_id, expires_at, max_submissions)
  retakes(id, invite_id, submitter_id, media_url, mode, created_at)
  ```
- RLS(Row Level Security) 정책: "자기 invite만 조회/삭제", "공개 invite는 GET 허용"
- Blob은 **media 저장소로만** 사용 (메타는 DB)

#### 1-3. 미디어 저장소를 private 기본으로
- 모든 Blob을 `access: 'private'`로
- 다운로드는 짧은 수명의 signed URL 발급 엔드포인트 신설:
  ```
  GET /api/media/:id  →  서버에서 권한 체크 → 302 redirect to signed URL (만료 60s)
  ```
- 이렇게 하면 invite URL이 유출되어도 비인가 접근 불가, 만료 후 자동 만료

#### 1-4. 입력 검증 강화
- 업로드 시 매직바이트(file-type 라이브러리)로 실제 포맷 검사. SVG/HTML 완전 차단
- 이미지 사이즈/디멘션 상한 (Sharp로 리사이즈 후 저장 → 비용↓ + iOS 트래픽↓)
- `frameName`·`username`: 길이/문자/금칙어 필터

#### 1-5. Rate limiting + abuse 방어
- **Vercel Edge Middleware** + **Upstash Redis** (둘 다 무료 티어, 콜드스타트 거의 없음):
  ```js
  ratelimit.limit(`upload:${userId}`)  // 분당 10건
  ratelimit.limit(`invite:${ip}`)      // IP당 시간당 30건
  ```
- 매우 가볍고 (~5ms), 비용 폭발 방지

#### 1-6. CORS 잠그기
- 응답 헤더에 `Access-Control-Allow-Origin: https://retake.it.com` (앱 origin만)
- 모바일 WebView는 `capacitor://localhost` 등 명시

### 단계 2. iOS 클라이언트 옵션별 추가 작업

#### 옵션 A — Capacitor 래핑 (권장, "가벼움" 충족)
- `npm i @capacitor/core @capacitor/ios`
- `npx cap init` → `npx cap add ios`
- 카메라는 `@capacitor/camera` 플러그인으로 교체
  (getUserMedia보다 안정적, AVFoundation 직접 사용)
- 권한 plist: `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`,
  `NSMicrophoneUsageDescription` (영상 녹화 시)
- **Sign in with Apple**: `@capacitor-community/apple-sign-in`
- 빌드 후 Xcode → TestFlight
- 장점: 현재 React/CSS 100% 재사용
- 단점: 60fps 캔버스/스티커 인터랙션이 무거우면 끊김

#### 옵션 B — 네이티브 SwiftUI
- 백엔드만 공유. iOS는 AVFoundation으로 카메라, PencilKit으로 드로잉, Metal로 합성
- → **가장 부드러움**
- 단점: 개발 시간 4~10배

#### 옵션 C — Hybrid (권장 차선)
- 정적 화면 (intro, accept, submitted): WebView
- 카메라/캔버스: 네이티브
- Capacitor + 커스텀 플러그인

### 단계 3. "이음매 없는 구동"을 위한 디테일

1. **로컬 캐시 & 오프라인 큐**
   - 촬영물은 일단 로컬에 저장 → 백그라운드 업로드
   - 네트워크 끊김 = 사용자 입장에선 즉시 성공
   - iOS는 `URLSession` background upload 또는 Capacitor `Filesystem` + 재시도 큐

2. **WebP/HEIC + 서버 리사이즈**
   - 업로드 전 1080p 압축
   - iOS는 HEIC 네이티브, 백엔드에서 JPEG로 변환 후 저장 → 트래픽 ½

3. **Vercel Edge Functions로 미디어 라우팅**
   - `/api/media/:id` 같은 핫패스는 Edge Runtime으로
   - 콜드스타트 거의 없음, 첫 프레임 로딩 끊김 제거

4. **CDN preload**
   - invite 로드 시 frame 이미지 URL을 받자마자
     `<link rel="preload" as="image">` 또는 iOS에서 `URLSession.prefetch`
   - → ACCEPT → CAMERA_LIVE 전환이 깜빡임 없음

5. **분석 / 크래시 리포팅 (가벼운 것)**
   - Sentry (저렴) 또는 Vercel Analytics
   - 모바일 카메라 실패 원인 추적 필수

6. **App Tracking Transparency**
   - PII가 사용자 식별에 쓰이면 ATT 프롬프트 필요 (iOS 14.5+)
   - 현재 username 자유입력이라 nickname이라 ATT 비대상이지만, 분석 SDK 도입 시 주의

### 단계 4. 출시 전 체크리스트 (개인정보)
- 약관·개인정보 처리방침 페이지 (App Store 필수, URL 등록)
- 데이터 삭제 요청 엔드포인트 (App Store 정책 2023.6~ 필수):
  `DELETE /api/users/me` → 모든 invite/retake/blob 일괄 삭제
- 미성년자 보호 정책 (Apple 연령 등급)
- KISA/PIPA: 한국 서비스라면 이메일 수집 동의 체크박스 + 보관기간 명시

---

## 7. 리팩토링 계획 (Refactor)

### 7-1. 왜 지금 해야 하나
현재 상위 6개 파일 줄 수:

| 파일 | 줄 수 | 문제 |
|---|---:|---|
| `src/features/inviter/InviterPage.jsx` | **2,558** | 한 컴포넌트가 5개 플로우 상태(`INTRO`/`EDITING`/`TOOL_ACTIVE`/`STEP3_*`)를 모두 보유. 거의 모든 hook이 한 곳에서 호출되어 재렌더 폭주 |
| `src/features/editor/hooks/useStickerSystem.js` | **1,604** | 추가/선택/변형(스케일·회전·이동)/정제(refine)/undo·redo 클론까지 한 훅 안에 |
| `src/features/invitee/InviteePage.jsx` | **1,257** | Inviter와 카메라/캔버스 로직이 거의 복붙. 이미 editor에 공유 컴포넌트 있는데도 페이지 레벨에선 중복 |
| `src/features/editor/hooks/useCanvasDrawing.js` | **1,071** | 펜/지우개/브러시 상태 + DOM 측정 + 포인터 핸들러 혼재 |
| `src/features/editor/hooks/useRetakeCamera.js` | **628** | 22개 ref. stream/recorder/timer/pointer/flash가 한 훅에 |
| `src/features/editor/hooks/useMagicEraser.js` | **351** | (양호) |

문제는 단순히 "길다"가 아니라:
- **모바일 60fps 캔버스 인터랙션**에 영향. setState 한 번이 2558줄 컴포넌트 전체를 리렌더
- **테스트 불가능**. 한 hook이 너무 많은 책임을 가져 단위 테스트 작성이 의미 없음
- **iOS 디플로이(Capacitor) 후 디버깅 지옥**. Safari WebKit과 iOS WebView의 미묘한 차이를 좁히려면 로직이 작은 단위로 격리돼야 함
- **새 기능 추가 비용 폭증**. 스티커 한 종류 추가하려면 1604줄 훅을 이해해야 함

### 7-2. 리팩토링 우선순위와 안전한 순서

> 원칙: **동작 변경 0**, **공개 API 호환 유지**, 각 단계 후 `npm run build` + 모바일 스모크 테스트.

#### Phase A. `useStickerSystem` 분할 (1604줄 → ~300줄 × 5)
- `useStickerStore.js` — 스티커 배열 상태와 CRUD만 (셀렉터 패턴)
- `useStickerSelection.js` — 활성 스티커, hit-test, 선택 UI
- `useStickerTransform.js` — pan/scale/rotate 제스처 (이미 있는 `transformGesture.js` 활용)
- `useStickerRefine.js` — refine 모드 진입/저장
- `useStickerHistory.js` — undo/redo (현재 `useHistory.js`로 위임)
- 외부 노출은 기존 `useStickerSystem`이 위 5개를 묶어 같은 객체 반환 (호환 유지)
- **예상 효과**: 스티커 변경 시 리렌더 범위가 사용 hook만으로 한정 → 캔버스 떨림 감소

#### Phase B. `InviterPage` 플로우 분리 (2558줄 → ~400줄 페이지 + 상태별 서브 화면)
현재 `INVITER_FLOW_STATES`가 5개 → 각 상태를 별도 컴포넌트로:
```
src/features/inviter/
  InviterPage.jsx              (~400줄) 라우팅 + flow state machine만
  flows/
    IntroFlow.jsx              (~150)   INTRO
    EditingFlow.jsx            (~500)   EDITING + TOOL_ACTIVE (편집 화면)
    Step3LiveFlow.jsx          (~400)   STEP3_LIVE (촬영)
    Step3ReviewFlow.jsx        (~300)   STEP3_PHOTO_REVIEW / STEP3_VIDEO_REVIEW
    Step3SavedFramesFlow.jsx   (~200)   STEP3_SAVED_FRAMES
  hooks/
    useInviterFlow.js          (~100)   상태 전이 reducer
    useInviterPersistence.js   (~150)   savedFrames localStorage 추출
```
- React Router 중첩 라우트 또는 단순 `switch`로 분기
- 각 flow가 자기 hook만 호출 → **편집 중에 카메라 훅이 마운트되지 않아 메모리·이벤트 리스너 절약**

#### Phase C. Inviter ↔ Invitee 공통화 (중복 제거)
- 두 페이지 모두 거의 동일한 카메라/리뷰/캔버스 셋업 보유
- 새로 `src/features/editor/screens/`에:
  ```
  RetakeCaptureScreen.jsx   // STEP3_LIVE = CAMERA_LIVE
  RetakeReviewScreen.jsx    // PHOTO_REVIEW + VIDEO_REVIEW
  ```
- Inviter와 Invitee는 이 화면을 props(저장 vs 제출 콜백)로 구성만
- **예상 효과**: 카메라 버그 수정이 한 번에 양쪽에 반영. invitee 1257줄 중 600줄 이상 제거 가능

#### Phase D. `useRetakeCamera` 분할 (628줄 → ~150줄 × 4)
- `useMediaStream.js` — getUserMedia, facing, capabilities
- `useMediaRecorderRetake.js` — 녹화 시작/중지/MIME 선택
- `useCameraGestures.js` — 더블탭, long-press, pointer capture
- `useScreenFlash.js` — 전면 카메라용 화면 플래시
- 같은 방식으로 외부 노출 hook은 묶음 객체로 호환 유지

#### Phase E. `useCanvasDrawing` 분리 (1071줄)
- `useBrushState.js` — 색/크기/투명도/툴 종류
- `useBrushPointer.js` — pointermove → path → 캔버스 commit
- `useBrushCursor.js` — DOM 커서 따라가기

#### Phase F. 공통 정비
- `lib/api.js`의 DEV 로컬 폴백을 `lib/api.local.js`로 분리 → 트리쉐이킹으로 PROD 번들에서 제외
- 모든 `useEffect` cleanup 점검 (특히 timer/RAF/stream)
- 큰 객체 deep clone을 immer 또는 structuredClone으로 통일 (메모리 누수 방지)
- `React.memo` + 안정적 콜백(`useCallback`) 일관 적용 (지금은 산발적)

### 7-3. 측정 가능한 목표

| 지표 | 현재(추정) | 목표 |
|---|---|---|
| 가장 큰 파일 | 2558줄 | < 500줄 |
| 단일 hook 최대 ref 수 | 22 (`useRetakeCamera`) | < 8 |
| Inviter↔Invitee 중복 코드 | ~800줄 | < 100줄 |
| 편집 중 스티커 1개 추가 시 리렌더 컴포넌트 수 | (측정 필요) | 50% 감소 |
| 모바일 캔버스 펜 stroke fps | (측정 필요) | 안정 60fps |

### 7-4. iOS 디플로이와의 우선순위 관계

| 작업 | 이상적 순서 | 실용적 순서 |
|---|---|---|
| Phase A,B (큰 파일 분할) | iOS 전 | iOS 후에 해도 됨, **단 Capacitor 빌드 직전 Phase D는 권장** |
| Phase C (공통화) | iOS 후 | 디플로이 이후 첫 번째 기술 부채 청산 작업 |
| Phase D (카메라 hook 분할) | **iOS 직전 권장** | Capacitor `@capacitor/camera`로 교체하려면 분리가 선결 |
| Phase E, F | 언제든 | 점진적 |

**합의된 권장**: 6번 디플로이 단계와 병행해서 **Phase D만 먼저** 진행. 나머지는 TestFlight 베타 이후 사용자 피드백 기반으로 우선순위 재조정.

---

## 8. 권장 우선순위 (현실적 로드맵)

1. **Auth 도입 + DB 분리** (1~2주) — 없으면 App Store 심사 통과 어려움
2. **Private blob + signed URL** (3일)
3. **Rate limit + CORS + 입력 검증 보강** (3일)
4. **Phase D 리팩토링** (`useRetakeCamera` 분할, 3일) — Capacitor 카메라 교체 사전 작업
5. **Capacitor 래핑 + Apple Sign-in** (1주)
6. **백그라운드 업로드 큐 + 미디어 리사이즈** (1주)
7. **TestFlight 베타 → 충돌 로그 보며 카메라 안정성 fix**
8. **Phase A, B, C, E, F** 점진적 (베타 ~ 정식 출시 사이)
