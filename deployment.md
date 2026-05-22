# Retake Prototype — 모바일(iPhone) 로컬 테스트 셋업 가이드

본 문서는 로컬 개발 서버(`https://10.0.0.25:5174`)에 iPhone Safari로 접속하여
**카메라 기능을 테스트하기 위해** 수행한 모든 단계와 셋업 내용을 정리한다.

> 핵심 원리: iOS Safari의 `getUserMedia` (카메라 권한)는 **HTTPS에서만 동작한다**.
> 그러나 자체서명 인증서는 iOS가 신뢰하지 않으므로 빨간 경고가 뜨고 카메라가 거부된다.
> 따라서 **로컬 CA(인증기관)를 만들어 PC와 iPhone 양쪽에 신뢰시키고**,
> 그 CA로 서명한 인증서를 Vite dev server가 사용하도록 구성한다.

---

## 0. 환경 정보 (이번 셋업 기준)

| 항목 | 값 |
|---|---|
| 운영체제 | Windows 11 |
| 사용자 홈 | `C:\Users\jshin` |
| 프로젝트 경로 | `C:\Users\jshin\Documents\Project\Make_Your_Frame\retake-web-prototype` |
| Wi-Fi 어댑터 IPv4 | **`10.0.0.25`** |
| Wi-Fi DNS 접미사 | `hsd1.ca.comcast.net` (Comcast 게이트웨이 `10.0.0.1`) |
| Vite dev 포트 | `5174` |
| iPhone 접속 URL | **`https://10.0.0.25:5174/`** |

> ⚠️ PC IP는 공유기/네트워크가 바뀌면 달라진다. 변경 시 [10. PC IP 변경 대응](#10-pc-ip가-바뀌었을-때) 참고.
>
> `ipconfig` 출력에서 IP가 안 보인다고 착각하기 쉬운 포인트:
> 일반적으로 `192.168.x.x`로 알려져 있지만, **`10.x.x.x`도 사설망 IP**다.
> Comcast 가정용 게이트웨이는 보통 `10.0.0.0/24`를 사용한다.

---

## 1. mkcert 설치 (Windows)

mkcert는 로컬 CA를 만들고 자체서명 인증서를 자동으로 발급해주는 도구다.

```powershell
winget install FiloSottile.mkcert --accept-source-agreements --accept-package-agreements --silent
```

설치 결과:
- 실행 파일 위치:
  ```
  C:\Users\jshin\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe
  ```
- 버전: `v1.4.4`
- PATH가 추가되지만, **이미 열려 있던 셸은 새 PATH를 못 본다.**
  → 새 PowerShell 창을 열거나 위 절대경로로 직접 호출.

확인:
```powershell
mkcert -version    # 새 셸에서
# 또는 절대경로
& "C:\Users\jshin\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe" -version
```

---

## 2. 로컬 CA를 Windows 신뢰 저장소에 설치

```powershell
& "C:\Users\jshin\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe" -install
```

출력:
```
Created a new local CA 💥
The local CA is now installed in the system trust store! ⚡️
```

이 시점에서:
- Windows 시스템 트러스트 스토어에 mkcert CA가 등록됨 → PC 브라우저는 즉시 신뢰
- CA 파일 보관 위치:
  ```
  C:\Users\jshin\AppData\Local\mkcert\
    ├─ rootCA.pem       ← iPhone에 보내야 할 파일
    └─ rootCA-key.pem   ← (절대 외부 공유 금지, CA 개인키)
  ```

> ⚠️ `rootCA-key.pem`은 **그 누구와도 공유 금지**. 이게 유출되면 누구든 너의 PC와 폰을 속일 수 있다.

---

## 3. 프로젝트용 인증서 발급

프로젝트 루트의 `.cert/` 폴더에, `localhost` / `127.0.0.1` / **현재 PC IP(`10.0.0.25`)** 세 호스트네임으로 동작하는 인증서를 발급한다.

```powershell
$certDir = "C:\Users\jshin\Documents\Project\Make_Your_Frame\retake-web-prototype\.cert"
if (-not (Test-Path $certDir)) { New-Item -ItemType Directory -Path $certDir | Out-Null }

& "C:\Users\jshin\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe" `
  -key-file  "$certDir\localhost-key.pem" `
  -cert-file "$certDir\localhost-cert.pem" `
  localhost 127.0.0.1 10.0.0.25
```

출력:
```
Created a new certificate valid for the following names 📜
 - "localhost"
 - "127.0.0.1"
 - "10.0.0.25"

It will expire on 22 August 2028 🗓
```

결과 파일:
```
retake-web-prototype/.cert/
  ├─ localhost-cert.pem   (1549 B)
  └─ localhost-key.pem    (1704 B)
```

> 📌 `.cert/`는 `.gitignore`에 포함되어 있으므로 Git에 커밋되지 않는다.
> 새 PC나 새 폴더에서 셋업할 때마다 위 절차를 다시 수행해야 한다.

### 3-1. Vite가 이 인증서를 자동으로 사용하는 방법

[vite.config.js](vite.config.js):
```js
const httpsKeyPath  = path.join(rootDir, '.cert/localhost-key.pem');
const httpsCertPath = path.join(rootDir, '.cert/localhost-cert.pem');
const useLocalHttps = (
  process.env.VITE_DEV_HTTPS === '1'
  && fs.existsSync(httpsKeyPath)
  && fs.existsSync(httpsCertPath)
);
```
즉, `VITE_DEV_HTTPS=1`이 설정되고 `.cert/` 파일이 존재해야만 HTTPS로 뜬다.
`npm run dev`는 내부적으로 `VITE_DEV_HTTPS=1`을 설정한다.

---

## 4. iPhone에 루트 CA 설치 (신뢰시키기)

iPhone Safari가 자체서명 인증서를 받아들이게 하려면, 위에서 만든 **`rootCA.pem`**을
iPhone에 설치하고 "전체 신뢰" 토글을 켜야 한다.

### 4-1. rootCA.pem을 접근 가능한 위치로 복사

`AppData`는 Windows에서 **숨김 폴더**라 탐색기에서 곧바로 안 보인다.
가장 쉬운 우회: 바탕화면으로 복사.

```powershell
Copy-Item "C:\Users\jshin\AppData\Local\mkcert\rootCA.pem" "$env:USERPROFILE\Desktop\rootCA.pem" -Force
```

결과 파일:
```
C:\Users\jshin\Desktop\rootCA.pem
```

> 다른 방법: 파일 탐색기 주소창에 `%LOCALAPPDATA%\mkcert` 입력하면 환경변수가
> 숨김 경로도 통과시켜 바로 열린다. 또는 **보기 → 표시 → 숨긴 항목** 체크.

### 4-2. iPhone으로 전송

다음 중 편한 방법:
1. **Gmail**: 바탕화면의 `rootCA.pem`을 본인(`jshin0407@gmail.com`)에게 첨부
2. **iCloud Drive**: Windows iCloud 앱이 깔려 있으면 iCloud Drive 폴더에 복사
3. **AirDrop**: Windows는 미지원 (Mac에서만 가능)
4. **USB 케이블 + Finder/iTunes**
5. **Google Drive / Dropbox**: 업로드 후 iPhone에서 다운로드

### 4-3. iPhone에서 프로파일 설치

1. Mail/파일/Drive 등에서 받은 `rootCA.pem` 파일 탭
2. "프로파일이 다운로드됨" 알림 표시
3. **설정 → 일반 → VPN 및 기기 관리** → **mkcert** 프로파일 → **설치**
   - 암호 요구 시 iPhone 잠금 암호 입력
   - 경고 화면 ("이 프로파일은 서명되지 않았습니다") → 설치 계속

### 4-4. ⚠️ 전체 신뢰 켜기 (반드시 수행)

iOS 10.3+ 부터는 프로파일 설치만으로는 신뢰가 활성화되지 않는다. **별도로 토글**을 켜야 한다.

**설정 → 일반 → 정보 → 인증서 신뢰 설정** → "**ROOT CERTIFICATES FULL TRUST**" 섹션의
**mkcert development CA** 토글을 **ON**.

> 이 단계를 빼먹으면 iPhone Safari가 여전히 "안전하지 않음" 경고를 띄우고
> `getUserMedia`(카메라)가 거부된다. **가장 흔한 실패 원인.**

---

## 5. Windows 방화벽에서 5174 포트 허용

Vite dev 서버는 `0.0.0.0:5174`로 바인딩되지만, Windows Defender 방화벽이 외부(iPhone)
접속을 차단하면 페이지 자체가 안 열린다.

### 5-1. 수동 (간단)
- 처음 `npm run dev:https` 실행 시 Windows Defender 팝업이 뜬다
- **"개인 네트워크 허용"** 체크 → 허용
- (공용 네트워크는 체크하지 않아도 됨)

### 5-2. 미리 등록 (선택, 관리자 PowerShell)
```powershell
New-NetFirewallRule -DisplayName "Vite Dev 5174" -Direction Inbound `
  -LocalPort 5174 -Protocol TCP -Action Allow -Profile Private
```

### 5-3. 네트워크 프로파일 확인
- **설정 → 네트워크 및 인터넷 → Wi-Fi → 현재 네트워크 → 속성**
- "네트워크 프로파일 형식"이 **개인(Private)** 인지 확인
- "공용(Public)"이면 방화벽이 거의 모든 인바운드를 차단함 → "개인"으로 변경

---

## 6. 의존성 설치 + Dev 서버 실행

### 6-1. 한 번만 (의존성)
```powershell
cd C:\Users\jshin\Documents\Project\Make_Your_Frame\retake-web-prototype
npm install
```
이번 셋업에서는 73개 패키지가 ~3초 만에 설치 완료 (캐시 덕분).

### 6-2. 매번 (서버 시작)

`package.json`에 정의된 스크립트:
```json
"dev":       "VITE_DEV_HTTPS=1 vite"
"dev:http":  "vite"
"dev:https": "VITE_DEV_HTTPS=1 vite"
```

> ⚠️ Windows PowerShell에서는 `VITE_DEV_HTTPS=1 vite` 형식의 inline env var 구문이
> 안 통한다. `npm run dev:https`도 npm이 셸을 거치므로 어떨 땐 실패한다.
> 가장 안전한 방법:

```powershell
Set-Location "C:\Users\jshin\Documents\Project\Make_Your_Frame\retake-web-prototype"
$env:VITE_DEV_HTTPS = "1"
npx vite
```

성공 시 출력:
```
  VITE v5.4.21  ready in 244 ms

  ➜  Local:   https://localhost:5174/
  ➜  Network: https://10.0.0.25:5174/
```

`Network:` 줄에 나오는 URL이 **iPhone에서 접속할 주소**다.

### 6-3. 서버 정지
PowerShell에서 `Ctrl+C`. 백그라운드로 띄웠으면 Task Manager에서 `node.exe` 종료.

---

## 7. iPhone에서 카메라 테스트

### 7-1. 사전 확인
- iPhone과 PC가 **같은 Wi-Fi**에 연결됨
- 공유기에서 "AP 격리(Client Isolation)" 옵션이 꺼져 있음 (게스트 망/카페 망은 켜져 있는 경우 많음)

### 7-2. Safari에서 접속

| URL | 설명 |
|---|---|
| `https://10.0.0.25:5174/` | 루트 (현재 `InviterPage`로 리다이렉트) |
| `https://10.0.0.25:5174/inviter` | 프레임 제작자 플로우 (편집 → 우하단 카메라 버튼) |
| `https://10.0.0.25:5174/invite/demo` | 초대받은 사람 플로우 빠른 시작 (DEV 모드 데모 invite, ACCEPT → 카메라 바로 권한 요청) |

성공 신호:
- 주소창에 **자물쇠 아이콘** 표시 (빨간 경고 없음)
- ACCEPT 또는 카메라 버튼 → **카메라 권한 프롬프트** → 허용 → 라이브 뷰파인더 정상 출력

### 7-3. 데모 invite 동선 (가장 빠른 카메라 테스트)
1. `https://10.0.0.25:5174/invite/demo`
2. `InviteAcceptCard` 표시 → ACCEPT 탭
3. 카메라 권한 요청 → 허용
4. `CAMERA_LIVE` 상태 진입 → 셔터 또는 길게눌러 녹화 테스트

`lib/api.js`의 `getInvite()` 안에 `id === 'demo'`일 때 백엔드 없이 로컬 폴백 데이터를
반환하는 코드가 있어 백엔드 환경 없이도 동작한다.

---

## 8. 안 될 때 — 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 페이지 자체가 안 뜸 (Safari 무한 로딩) | 방화벽 차단 / Wi-Fi 다름 / 공유기 AP 격리 | 5단계 점검, iPhone의 Wi-Fi 상세에서 IP가 같은 `10.0.0.x`인지 확인 |
| 빨간 "안전하지 않은 연결" 경고 | iPhone에 rootCA 미설치 또는 신뢰 토글 OFF | 4-4 단계 ("인증서 신뢰 설정" 토글 ON) |
| 자물쇠는 있는데 카메라 권한 프롬프트가 안 뜸 | URL이 `http://` | URL을 `https://`로 |
| 권한은 허용했는데 검은 화면 | iOS Safari가 백그라운드 → 복귀 시 stream 정지 (알려진 버그) | 페이지 새로고침. 코드 측 해결책은 `plan.md` 5-B-2 참고 |
| 카운트다운 후 영상 녹화 실패 | iOS 16.4 미만 (MediaRecorder 미지원) | iOS 업데이트 또는 사진 모드만 사용 |
| `npm run dev` 시 HTTPS 대신 HTTP로 뜸 | `.cert/` 파일 누락 또는 `VITE_DEV_HTTPS` 미설정 | 3단계 재실행 + 6-2 방식으로 시작 |
| `mkcert` 명령을 못 찾음 | 셸이 새 PATH를 못 읽음 | 새 PowerShell 창에서 시도 또는 절대경로 사용 |
| dev server 시작 시 `EADDRINUSE 5174` | 기존 vite 프로세스가 살아있음 | Task Manager에서 `node.exe` 정리 후 재시작 |

---

## 9. 파일 인벤토리 (이번 셋업이 만든/사용한 것)

```
C:\Users\jshin\AppData\Local\mkcert\
  rootCA.pem                  로컬 CA 공개 인증서. iPhone과 다른 기기들에 배포할 파일
  rootCA-key.pem              로컬 CA 개인키. 절대 공유 금지

C:\Users\jshin\Desktop\
  rootCA.pem                  위 파일의 복사본 (iPhone으로 전송 편의용)

C:\Users\jshin\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_…\
  mkcert.exe                  mkcert 실행 파일

retake-web-prototype\.cert\
  localhost-cert.pem          Vite dev server가 사용할 서버 인증서
  localhost-key.pem           Vite dev server가 사용할 서버 개인키

retake-web-prototype\node_modules\              npm install 결과 (73 packages)
```

---

## 10. 네트워크가 바뀌었을 때 (카페·공용 Wi-Fi 등)

PC의 사설 IP는 다음 경우 바뀐다:
- 다른 Wi-Fi에 연결 (집 → 카페, 카페 A → 카페 B 등)
- 공유기 재시작
- DHCP 임대 만료 후 갱신

> 💡 `localhost` / `127.0.0.1`은 네트워크와 무관하게 PC 자기 자신에서는 항상 동작한다.
> **노트북 브라우저에서만 테스트할 거면** 아무 설정도 필요 없다.
> 아이폰 등 외부 기기로 테스트하려면 아래 절차.

### 10-1. 새 네트워크 셋업 3단계 (가장 흔한 케이스)

#### 1) 새 IP 확인
```powershell
ipconfig
```
"`Wireless LAN adapter Wi-Fi`" 섹션의 "IPv4 Address" 줄 메모.
카페마다 대역이 다름:
- 집(Comcast 등) → `10.0.0.x`
- 공유기 일반 → `192.168.x.x`
- 스타벅스 등 → `172.x.x.x`

#### 2) 인증서 재발급 (예: 새 IP가 `172.20.10.5` 라고 가정)
```powershell
$mkcert = "C:\Users\jshin\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe"
$certDir = "C:\Users\jshin\Documents\Project\Make_Your_Frame\retake-web-prototype\.cert"
& $mkcert -key-file "$certDir\localhost-key.pem" -cert-file "$certDir\localhost-cert.pem" `
  localhost 127.0.0.1 10.0.0.25 172.20.10.5
```
> 기존 IP(`10.0.0.25`)도 함께 적어두면 집·카페 양쪽에서 같은 인증서로 동작.
> mkcert SAN(Subject Alternative Name)에 호스트 여러 개를 동시에 등록할 수 있다.

#### 3) dev 서버 재시작
```powershell
Set-Location "C:\Users\jshin\Documents\Project\Make_Your_Frame\retake-web-prototype"
$env:VITE_DEV_HTTPS = "1"
npx vite
```
출력의 `Network:` 줄이 `https://172.20.10.5:5174/`로 바뀜 → 아이폰에서 이 주소로 접속.

> ✅ 아이폰 측은 **추가 작업 불필요**.
> 한 번 신뢰시킨 mkcert 루트 CA는 모든 자식 인증서를 영구히 신뢰한다.

### 10-2. 자주 다니는 곳들 IP를 미리 등록해두기 (편의 팁)
```powershell
& $mkcert -key-file "$certDir\localhost-key.pem" -cert-file "$certDir\localhost-cert.pem" `
  localhost 127.0.0.1 `
  10.0.0.25 `
  192.168.0.10 192.168.1.10 `
  172.20.10.2 172.20.10.3 172.20.10.4 172.20.10.5
```
한 번에 여러 IP를 등록해두면 네트워크 바뀔 때마다 재발급 안 해도 된다.
새 카페에서는 그 카페에서 받은 IP만 확인하면 됨.

### 10-3. 시나리오별 가이드

| 상황 | 권장 방법 |
|---|---|
| 노트북 브라우저로만 테스트 | `https://localhost:5174/` — 네트워크 무관, 셋업 0 |
| 카페에서 노트북 + 아이폰 (같은 Wi-Fi) | 위 10-1 3단계 (새 IP 확인 → 재발급 → 재시작) |
| 카페 Wi-Fi가 **AP 격리(Client Isolation)** 켜진 곳 | 같은 Wi-Fi인데도 기기 간 통신 차단 → 10-4 터널 사용 |
| 아이폰만 셀룰러 / 노트북은 카페 Wi-Fi (다른 네트워크) | 10-4 터널 사용 또는 아이폰 핫스팟에 노트북 붙이기 |
| 자주 카페·집 왔다갔다 + 항상 아이폰 테스트 | **Tailscale** 영구 IP (10-5) 강력 추천 |

### 10-4. 임시: 터널 서비스 (어디서든 접근 가능)

#### Cloudflare Tunnel (무료, 가입 불필요)
```powershell
winget install Cloudflare.cloudflared
# dev 서버가 돌고 있는 상태에서, 새 PowerShell 창:
cloudflared tunnel --url https://localhost:5174 --no-tls-verify
```
출력에 `https://random-words-1234.trycloudflare.com` 같은 임시 URL 표시.
- ✅ 인터넷 어디서든 접근 가능 (셀룰러 포함)
- ✅ Cloudflare가 발급한 진짜 인증서 → **mkcert / 아이폰 CA 신뢰 작업 완전 불필요**
- ⚠️ 명령어 끄면 URL 사라짐 (임시 도메인)

#### ngrok (대안)
```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <발급받은_토큰>
ngrok http https://localhost:5174
```
무료 플랜은 URL이 매번 바뀌고 첫 진입 시 안내 페이지 1회 표시.

### 10-5. 영구 해결: Tailscale (장기적으로 가장 깔끔)

본인 기기들끼리(노트북+아이폰+다른 기기) 가상 사설망을 만들어
**네트워크가 바뀌어도 IP가 절대 안 바뀌게** 만드는 방법.

1. PC와 아이폰 모두 [Tailscale](https://tailscale.com) 설치 → 같은 계정으로 로그인 (Google/Apple SSO)
2. PC의 Tailscale IP 확인:
   ```powershell
   tailscale ip -4
   # 예: 100.92.143.7
   ```
3. **인증서 한 번만** 발급 (이 IP는 영구 고정):
   ```powershell
   & $mkcert -key-file "$certDir\localhost-key.pem" -cert-file "$certDir\localhost-cert.pem" `
     localhost 127.0.0.1 100.92.143.7
   ```
4. 어디서든 (카페·셀룰러·기차·해외 호텔 등) 아이폰 Safari → `https://100.92.143.7:5174/`

- ✅ 무료 (개인 사용 100대까지)
- ✅ 카페 AP 격리도 통과 (WireGuard 터널)
- ✅ 한 번 셋업하면 끝, 그 후 평생 인증서 재발급 불필요
- ⚠️ PC와 아이폰 모두 Tailscale 앱이 켜져 있어야 함

### 10-6. 집 네트워크에서 IP 고정시키기 (옵션)
공유기 관리 페이지에서 PC MAC 주소에 **고정 IP를 DHCP 예약**으로 묶어두면
집에선 매번 같은 IP가 할당된다. 단, 이건 집 한 곳에서만 유효.

---

## 11. 보안 메모

- `rootCA-key.pem`은 PC 안에서만 보관, **외부 전송 금지**
- 이 셋업은 **로컬 개발 전용**. 운영 환경에는 절대 가져가지 말 것
- iPhone에 설치된 mkcert CA는 그 폰에서 **모든 mkcert-서명 사이트를 신뢰**하게 한다.
  공용 폰이나 가족 폰엔 설치하지 말 것
- 더 이상 필요 없으면:
  - iPhone: 설정 → 일반 → VPN 및 기기 관리 → mkcert 프로파일 제거
  - Windows: `mkcert -uninstall` 후 `.cert/` 폴더 삭제

---

## 12. 다음 단계 후보 (참고)

이 로컬 셋업으로 카메라 테스트가 정상 동작하는 걸 확인했다면,
실제 모바일(iOS) 출시까지의 다음 단계는 `plan.md`의 **6. iOS 백엔드 디플로이 단계**를 참고:
- Auth 도입 (Apple Sign-in)
- Blob private + signed URL
- Rate limit, CORS, 입력 검증 보강
- Capacitor 래핑 → TestFlight
