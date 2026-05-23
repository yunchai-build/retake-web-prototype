# Retake Prototype — 모바일 테스트 피드백 분석

본 문서는 모바일(iPhone Safari, `https://10.0.0.25:5174/`)에서 프로토타입을
사용자 테스트하며 발견한 6가지 이슈에 대한 **코드 레벨 분석 + 수정 난이도 + UX 영향**을 정리한다.

> 이 문서는 분석만 담는다. 실제 수정은 별도 PR로 진행.

---

## 1️⃣ 사진 줌아웃 안 됨 (최대 = 사진 사이즈)

**증상**: Inviter 첫 단계에서 사진을 캔버스에 올린 뒤, 줌인은 되는데
줌아웃은 사진 원본 사이즈에서 더 이상 안 작아짐. 인스타처럼 줌아웃하면
프레임 바깥 영역이 사진 평균색의 plain canvas로 연장되는 동작을 원함.

### 무엇이 일어나는가
[`useMediaTransform.js:10`](src/features/editor/hooks/useMediaTransform.js):
`MIN_SCALE = 0.65`가 기본값이지만, 실제 차단 주범은
[`canvas.js:144-171`](src/features/editor/utils/canvas.js)의 `clampPortraitHeightTransform`:

```js
// 'portrait-height' fit + 세로 사진일 때:
const effectiveScale = Math.max(transformScale, height / rotatedHeight);
```

즉 "사진이 캔버스 세로를 가득 채우는 스케일" 밑으로는 강제로 끌어올림.
가로 여백이 생기는 걸 막으려고 일부러 넣은 클램프인데, 인스타식 줌아웃을 막아버린 셈.

`drawContainedImageWithBackground`는 이미 `getAverageImageColor(image)`로 평균색
배경을 칠하고 있어서 — **줌아웃 시 배경 깔리는 기능은 이미 절반 구현돼 있음**.
클램프가 그걸 못 쓰게 막고 있을 뿐.

### 수정 난이도: 🟢 쉬움 (1~2시간)
- `clampPortraitHeightTransform`를 옵션으로 끄거나(`allowZoomOut: true`),
  Inviter S2(갤러리 transform)에서만 비활성화
- `MIN_SCALE`을 0.3~0.4로 낮춤
- 이미 있는 `getAverageImageColor` 폴백이 자동으로 빈 공간을 채워줌

### UX 영향: ✅ 긍정적
- 인스타/포스터처럼 폴라로이드 느낌 가능
- 단, 너무 작게 줌아웃하면 의도 못한 큰 단색 배경이 생김 → `minScale: 0.4` 정도로 제한 권장
- 평균색 배경이라 사진과 자연스럽게 이어지지만, 콘트라스트 강한 사진(인물+검정배경)은
  살짝 어색할 수 있음 → 추후 "blur 확장" 옵션도 고려 가능 (Instagram도 이걸로 진화함)

---

## 2️⃣ 스티커 mark — 한 번에 지우기 + 배치 후 삭제 버튼

이 이슈는 두 가지 다른 문제가 섞여 있음:

### 2-a. "스티커 만들 때 mark 일괄 지우기"

#### 무엇이 일어나는가
- 스티커를 만드는 refine 모드에는
  [`EraserBar.jsx:76`](src/features/editor/components/EraserBar.jsx)의 "Clear" 토글이
  있는데, 이건 **"지우개 모드 on/off"** 라서 누른 후 캔버스에서 마크를 일일이 지워야 함
- [`StickerRefineControls.jsx:36-42`](src/features/editor/components/StickerRefineControls.jsx)에도
  "Clear" 버튼이 있는데, 이건 refine 작업 전체 리셋용으로 보임 (별도 확인 필요)
- 두 Clear 버튼의 차이가 모호 → 사용자 혼란이 정확함

#### "바운더리인지 fill인지 헷갈림" 정확한 답
[`smartSelection.js`](src/features/editor/utils/smartSelection.js) 기반으로 →
**바운더리(라쏘) 그리면 내부 영역이 자동 fill** 되는 방식. 즉 둘 다임.
UI가 이걸 시각적으로 안 알려줌 → 어니언 스킨 같은 프리뷰 필요.

#### 수정 난이도: 🟡 중간 (반나절~1일)
- "Clear all marks" 버튼 추가는 1줄
  (이미 `clearStickers`/`clearSelection` API 있음)
- 두 Clear 버튼 네이밍 정리 ("Erase mode" vs "Reset all")
- "라쏘 → fill 자동" 동작을 첫 사용 시 토스트로 안내

### 2-b. 배치된 스티커 우측상단 ✕ 삭제 버튼

#### 무엇이 일어나는가
- `useStickerSystem`에
  [`removeSticker`](src/features/editor/hooks/useStickerSystem.js#L278) 함수는 이미 있음
- 하지만 UI에 노출이 안 됨 — 현재는 `clearStickers`(전체 삭제)만 메뉴에 있고
  개별 삭제는 안 보임
- 선택된 스티커 주위에
  [`SelectionModeButtons`](src/features/editor/components/SelectionModeButtons.jsx)가
  떠 있는데 거기에 삭제 버튼이 없음

#### 수정 난이도: 🟢 쉬움 (2~3시간)
- `SelectionModeButtons`에 ✕ 버튼 하나 추가 → `removeSticker(activeSticker)`
  연결만 하면 끝
- 위치: 일반적인 패턴은 선택 박스 우상단 코너에 절대 위치

### UX 영향: ✅ 매우 긍정적
- 잘못 만든 스티커 삭제가 직관적이 됨 (모바일 UX 기본 패턴)
- 다만 ✕ 버튼이 너무 가까우면 의도치 않은 터치 발생 → 약간 떨어진 코너 +
  토스트 "스티커 삭제됨" + Undo 버튼이 좋음 (useHistory에 이미 stack 있음)

---

## 3️⃣ 쉐어 받은 쪽에서 갤러리 사진 줌/드래그 안 됨

**증상**: Invitee 화면에서 카메라 라이브 피드는 핀치/드래그 잘 됨.
하지만 갤러리에서 기존 사진을 불러오면 그 사진은 줌/드래그 불가.

### 무엇이 일어나는가
[`useRetakeCamera.js:88`](src/features/editor/hooks/useRetakeCamera.js)에서
**카메라 라이브 피드에는** `cameraTransform = useMediaTransform({...})`가 잘 연결됨
→ 그래서 카메라는 됨.

하지만 [`InviteePage.jsx:431`](src/features/invitee/InviteePage.jsx)의
`galleryInputRef.current?.click()`로 사진을 받아오면, 그 사진은 그냥
`camera.photoUrl`로 들어가서 review 화면에 표시될 뿐,
**transform 훅이 안 붙어 있음**. 포인터 핸들러도 없음.

코드 추적:
- Inviter는 [`s2GalleryTransform`](src/features/inviter/InviterPage.jsx#L399)으로
  갤러리 사진에 transform 붙임 ✓
- Invitee는 같은 패턴이 누락됨 ✗

### 수정 난이도: 🟢 쉬움 (3~4시간)
1. Invitee에 `galleryPhotoTransform = useMediaTransform({...})` 추가
2. 갤러리에서 받은 사진을 라이브 카메라 자리에 띄울 때 transform style 적용
3. 합성 시(`composePhotoBlob`) 이 transform을 같이 반영

이미 Inviter에 동일 패턴이 있어서 거의 복사-붙여넣기.

### UX 영향: ✅ 일관성 회복
- 사용자 입장에선 "카메라는 줌 되는데 사진은 안 되네?" → 버그로 느낌
- 수정 후 일관된 인터랙션 (양쪽 다 핀치/드래그)

---

## 4️⃣ "yunchai wants you in the frame" — 사용자마다 다르게 되나?

**증상**: 쉐어하면 받은 사람 화면에 "yunchai wants you in the frame"이 뜸.
실제 사용자마다 이름이 다르게 나와야 하지 않나?

### 답: 부분적으로 됨, 하지만 현재 UI가 막고 있음

[`InviteAcceptCard.jsx:34`](src/features/invitee/components/InviteAcceptCard.jsx):
```jsx
<h1>{invite.username} wants you in the frame</h1>
```

`invite.username`은 데이터에서 옴 → 사용자마다 다를 수 있는 **구조**임 ✓

하지만 두 곳에서 'yunchai'가 강제됨:
- [`api/invite.js:5`](api/invite.js): `DEFAULT_USERNAME = 'yunchai'`
- [`src/lib/api.js:93`](src/lib/api.js): `username: username || 'yunchai'`

→ 사용자 본인 이름을 입력받는 UI(`Step3SavedFrames` 어딘가에 `EditNamePopup` 있긴 함)에서
username을 setting → createInvite로 넘기면 invite마다 다르게 저장됨.

문제는: **현재 Inviter UI에 username 입력 필드가 명확히 노출되지 않은 것 같음**.
(frameName은 EditNamePopup으로 받는데 username은 안 받음)

### 수정 난이도: 🟡 중간 (반나절)
- Inviter에 username 입력 단계 추가 (intro 또는 share 시점)
- 입력값을 `createInvite({...username})`로 전달
- 또는 추후 Auth(`plan.md` 6단계)가 도입되면 자동으로 로그인 사용자명 사용

### UX 영향: ✅ 필수
- 지금처럼 모두 "yunchai"라고 뜨면 친구가 받았을 때 "이게 누구?" 의문. 신뢰도/공유의향 떨어짐
- 입력 한 단계 추가지만 IntroCard에 자연스럽게 통합 가능 ("What's your name?" → 1초)

---

## 5️⃣ 더블탭 → 카메라 플립 스위치 버튼

**증상**: 카메라 앞뒤 전환이 더블탭으로 가능하지만 직관적이지 않음.
명시적 스위치 버튼이 있으면 좋겠음.

### 답: 버튼은 이미 있어! 발견이 안 됐던 것

[`RetakeCameraControls.jsx:41-48`](src/features/editor/components/RetakeCameraControls.jsx):
```jsx
{showFlip && (
  <SolidIconButton icon="flipCamera" label="Flip camera" onClick={onFlip} />
)}
```

플립 버튼이 컴포넌트에 분명히 있음. 그런데 발견이 안 됐다면:
1. **컨트롤 바가 평소 숨겨져 있음** — `visible` prop이 false일 때 안 보임.
   카메라 화면을 한 번 탭해야 토글되는 식
2. 또는 timer/flash 아이콘들 사이에 끼어 있어서 시각적으로 묻혔을 가능성

코드 보면 더블탭 + 버튼 **둘 다 활성**이라 동시에 사용 가능. 그냥 발견성(discoverability) 문제.

### 수정 난이도: 🟢 매우 쉬움 (1~2시간)
- 플립 버튼을 셔터 옆에 단독으로 노출 (인스타/스냅챗 패턴)
- 또는 초기 표시 visible=true로 시작
- 더블탭은 파워유저용 단축키로 유지 (제거할 필요 없음)

### UX 영향: ✅ 긍정적
- 초보자: 버튼 → 즉시 발견
- 익숙해진 사용자: 더블탭 → 더 빠름
- 두 가지 다 살리는 게 정답. 다만 첫 사용 시 토스트로
  "💡 더블탭으로 빠른 전환" 한 번만 띄우면 발견성 100%

---

## 6️⃣ Invitee가 자기 사진 쉐어할 때 → 원본 프레임 링크도 함께

**증상**: 쉐어 받은 사람이 자기 사진 찍고 쉐어하면 합성된 사진만 공유됨.
원본 프레임(템플릿) 링크도 함께 공유돼야 같은 템플릿 쓴 친구들끼리 모일 수 있음.

### 무엇이 일어나는가
[`InviteePage.jsx:957-986`](src/features/invitee/InviteePage.jsx):
```js
const sharePayload = {
  title: 'My Retake',
  text: `Retake sent to ${invite?.username || 'them'}`,
};
await navigator.share({ ...sharePayload, files: [file] });
```

현재 공유 시:
- 합성된 사진 파일 1개 ✓
- 텍스트 "Retake sent to yunchai"
- **invite URL 없음** ✗

### 이 아이디어 = 바이럴 루프 ⭐
"같은 템플릿 쓴 친구들끼리 자동으로 모여 보기" — 굉장히 좋은 product 방향.
Snapchat의 Lens, BeReal의 RealMojis가 이걸로 큼.

### 수정 난이도: 두 단계

#### 6-a. 단순히 invite URL을 share text에 추가 (🟢 5분)
```js
text: `${invite.username}'s frame – join: ${window.location.href}`
```
끝. 인스타DM·iMessage에 링크 같이 보내짐.

#### 6-b. 진정한 "템플릿" 개념 도입 (🟡 1~2주 백엔드 작업)
현재 모델: `invite` = 1회용 받는 사람 슬롯 → 받은 사람이 또 쉐어해도
같은 invite를 가리킴 (의도 불분명)

필요한 모델 변경:
```
frames(id, owner, blob_url, name)         ← "템플릿" 본체
invites(id, frame_id, creator, ...)       ← 누군가가 다른 사람을 초대한 인스턴스
retakes(id, invite_id OR frame_id, ...)   ← 제출. frame_id로도 직접 모이게
```
이러면:
- 같은 `frame_id`의 모든 retake를 collect → "이 프레임으로 찍은 모든 친구들 갤러리"
- Invitee의 share에 `frame_id` 기반 새 invite를 생성해서 동봉
  → 친구의 친구도 같은 템플릿 사용 가능

이 변경은 `plan.md` 6-1-2(데이터 모델 DB로 이전)와 자연스럽게 결합됨.

### UX 영향: ✅ 매우 긍정적 (잠재적 바이럴)
- 6-a만 해도: 받은 친구가 "이거 뭐야?" → 링크 클릭 → 자기도 참여. Conversion 큼
- 6-b까지 하면: "내 사진+친구1 사진+친구2 사진"이 같은 프레임으로 모이는 갤러리
  → "BeReal과 차별화"되는 강력한 social hook
- 단, 6-b는 권한·삭제 정책이 복잡해짐 (누가 갤러리 비공개 결정? 한 명의 retake 삭제 권한은 누구?)

---

## 📊 요약 표

| # | 이슈 | 난이도 | 작업량 | UX 영향 | 우선순위 |
|---|---|---|---|---|---|
| 1 | 줌아웃 + 배경 채움 | 🟢 쉬움 | 1~2시간 | ✅ 매우 긍정적 | 높음 |
| 2a | 스티커 mark 일괄 지우기 | 🟡 중간 | 반나절 | ✅ 긍정적 | 중간 |
| 2b | 스티커 ✕ 삭제 버튼 | 🟢 쉬움 | 2~3시간 | ✅ 매우 긍정적 | **최우선** |
| 3 | 갤러리 사진 줌/드래그 | 🟢 쉬움 | 3~4시간 | ✅ 일관성 회복 | 높음 |
| 4 | username 동적화 | 🟡 중간 | 반나절 | ✅ 필수 | 높음 |
| 5 | 플립 버튼 발견성 | 🟢 매우 쉬움 | 1~2시간 | ✅ 긍정적 | 낮음 |
| 6a | 공유 텍스트에 링크 | 🟢 매우 쉬움 | 5분 | ✅ 즉시 바이럴 효과 | **최우선** |
| 6b | 진짜 템플릿 개념 | 🟡 큼 | 1~2주 | 🚀 핵심 차별화 | iOS 출시 후 |

### 추천 진행 순서 (모두 코드 수정 가능, 백엔드 변경 없이)
1. **6a** (5분) — 가장 큰 ROI. 바이럴 루프 즉시 생성
2. **2b** (오후 1) — 모바일 기본 UX
3. **1** + **3** (오후 1) — 사진 인터랙션 통일
4. **5** (틈틈이) — 플립 버튼 노출
5. **4** + **2a** (다음 날) — 입력 + 클리어 정리

6b는 `plan.md` Phase 1 (Auth + DB)와 함께 진행하는 게 자연스러움.

---

## 📋 진행 현황 (Status Log)

### 완료된 라운드

#### Round 1 — 모바일 6 이슈 (PR 1: `fix(editor)` `fix(inviter)` `fix(invitee+ui)`)
- ✅ 1: 줌아웃 시 계단현상 부분 개선 (`imageSmoothingQuality = 'high'`). 완전 해결은 DPR-aware canvas 리팩토링 필요(보류)
- ✅ 2b: 스티커 ✕ 삭제 버튼 — `touchend`로 처리해 iOS preventDefault 우회
- ✅ 3: 갤러리 사진 줌/드래그 (invitee + inviter step3 PHOTO 모드)
- ✅ 4: username — `createInvite`로 동적 전달 + invite share text에 반영
- ✅ 5: 플립 버튼 발견성 — invitee 우하단 단독 버튼 + inviter step3 3-button 레이아웃
- ✅ 6a: 공유 텍스트 — `url` 필드만 사용해 이중 링크 방지 + "Invite shared!" 토스트

### 추가 라운드 (PR 1에 함께 포함)

#### Sticker maker 진화
- ✅ Loop 모드(freehand) — 경계 → 내부 자동 채움 (안 채워지는 혼란 해결)
- ✅ Pen 모드 신설 — 옛 freehand 펜 동작 (수동 정밀)
- ✅ Refine 페이지에 "Clear All" 버튼 — 마스크 일괄 삭제
- ✅ Stage A에서 의미 없던 opacity slider 제거 + 아이콘 균등 배치

#### 기타
- ✅ `.toast` 검정 배경 — 노란 배경에서도 잘 보임
- ✅ `localStorage` quota 자동 정리 (`writeLocalRecord` + `persistSavedFrames`)
- ✅ 배경지우기 contrast bar에 역할 부여 — lasso 경계 미리보기 투명도 실시간 반영
- ✅ Inviter step3 PHOTO 모드에서 사진 pan/zoom/rotate
- ✅ 갤러리 input의 iOS Take Photo 옵션은 attribute로 제거 불가 — 문서화

### 남은 product items
- 6b: 진짜 템플릿 개념 (`frame_id`로 묶인 다중 retake 갤러리) — Auth+DB 도입 후
- 2a: 스티커 mark UI 두 Clear 버튼 네이밍 정리 ("Erase mode" vs "Reset all")
- Loop 동작 첫 사용 시 토스트 안내

### 리팩토링
- ✅ Phase D-부분: `useStep3Camera` 추출 (`refactor/use-step3-camera`)
  - step3 카메라 라이프사이클 268줄 → 별도 hook
  - InviterPage 88줄 감소
  - 자세한 진행상황은 `plan.md` 7-0
- ⏸ 나머지 phase는 UX iteration 안정 + iOS 디플로이 직전까지 보류
