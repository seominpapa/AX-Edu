# 건설인 AI Native 12주 프로젝트

실제 업무 결과물을 만들어 제출하고 평가를 통과해야 다음 주가 열리는 실행형 교육 웹앱입니다. 프런트엔드는 순수 HTML/CSS/ES Modules, API는 순수 JavaScript Cloudflare Worker, 데이터는 D1, 비공개 파일은 R2를 사용합니다. 프런트엔드 빌드·별도 서버·Docker가 없습니다.

## 현재 구현

- Google OAuth Authorization Code + PKCE/state, 확인된 Google 계정 신규 가입(PENDING), `SUPER_ADMIN_EMAIL` 최초 관리자 자동 승인, D1 서버 세션 및 HttpOnly/Secure/SameSite=Lax Cookie
- 관리자 승인·거절·정지·일괄 승인, 최초 직무 프로필, 사용자/관리자 대시보드
- 12주 Seed, 학습·자료 CMS, 도구 Guide, 정렬순서, 자료 최신성 확인, 주차 잠금
- 과제·Rubric·평가주체 AI/HUMAN/HYBRID 수정, 제출·이전 시도·재제출, 필수과제 PASS 시 다음 주 해금
- OpenAI Responses API JSON Schema 평가, 근거/강점/약점/필수 개선, 낮은 confidence·경계점수·평가 실패 시 관리자 검수
- 관리자 검수·점수·코멘트·AI 재평가, 수동 해금 및 감사 로그
- AES-GCM으로 암호화된 OpenAI Key(D1), 서버에서만 복호화, 연결 테스트
- 비공개 R2 업로드/다운로드, 사용자 소유권 및 자료 접근 확인, 확장자/MIME/파일 시그니처/크기 제한
- 서버측 관리자 권한, Origin 기반 CSRF 방어, SQL 바인딩, DOM textContent 기반 출력

## 실행

```bash
npm install
npm run db:local
npm run dev
```

로컬 테스트 서버는 `http://localhost:3000`입니다. `npm run build`는 없습니다. 로컬에서 `npm run db:remote && npm run deploy`로 배포할 수 있습니다. GitHub Actions 워크플로는 `npm ci` → `npm test` → D1 migration → `wrangler deploy` 순서로 준비되어 있지만, GitHub 앱의 Workflows·Secrets 권한이 없어 아직 저장소에 게시하거나 활성화하지 못했습니다.

## 운영 설정 (필수)

1. Cloudflare 계정 `sjkwak300@gmail.com`에 전용 D1 `construction-ai-native` (ID `f29c7e09-d2f7-4e9f-a0c3-ae6ff0f9e69d`) 및 비공개 R2 `construction-ai-native-files`를 생성했습니다. `wrangler.jsonc`는 이 리소스를 가리킵니다. 다른 계정에서 재배포하려면 ID와 bucket 이름을 바꾸세요.
2. Google Cloud Console의 **웹 애플리케이션 유형** OAuth Client에서 승인된 리디렉션 URI `https://construction-ai-native.sjkwak300.workers.dev/auth/callback`을 확인합니다. 로그인 시작 시 Google 계정 선택 화면으로 정상 이동하는 것까지 확인했습니다. OAuth 동의화면이 테스트 모드라면 관리자/사용자를 테스트 사용자로 추가해야 합니다.
3. Cloudflare Worker Secret `APP_ENCRYPTION_KEY`, `SUPER_ADMIN_EMAIL=sjkwak300@gmail.com`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 설정했습니다. 실제 Secret 값은 GitHub나 프런트엔드 코드에 커밋하지 않습니다. 암호화 키를 분실하면 저장된 OpenAI Key를 복호화할 수 없으므로 이 경우 OpenAI Key를 다시 저장해야 합니다. Google Client Secret은 채팅에 노출되었으므로 Google Cloud Console에서 새 Secret으로 교체하고 Cloudflare Secret도 갱신하는 것을 권장합니다.
4. 로컬 OAuth 테스트 시 `http://localhost:3000/auth/callback`도 Google Console에 등록하고 `.dev.vars`에 동일한 네 설정을 넣습니다. `.dev.vars`는 Git에서 제외합니다.
5. 최초 관리자 Google 로그인은 자동으로 `ADMIN / APPROVED`가 됩니다. 일반 사용자는 `PENDING` 상태로 가입하고, 관리자가 승인한 후 교육에 접근합니다. 관리자 화면에서 OpenAI API Key를 설정·연결 테스트·활성화합니다.
6. GitHub 저장소의 Actions Secret에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID=1531be39715b5ebfec7472624d91e51f`를 등록합니다. API 토큰에는 Workers Scripts Edit, D1 Edit 및 해당 계정 접근 권한이 필요합니다. Google/OpenAI Secret은 **Cloudflare Worker에만** 등록하면 배포 이후에도 유지됩니다. `.github/workflows/deploy.yml`은 `main` push 또는 수동 실행 시 테스트 후 migration과 Worker 배포를 실행합니다. PR에서는 테스트만 합니다.

**현재 배포 URL:** https://construction-ai-native.sjkwak300.workers.dev — Worker·D1·R2·Google OAuth Secret이 준비되어 있으며 `/api/auth/status`에서 `googleConfigured:true`를 확인했습니다. `/auth/google`이 Google 계정 선택 페이지로 연결되고 PKCE/state Cookie가 설정됩니다. 실제 계정으로 완료되는 OAuth 콜백은 사용자가 직접 로그인하여 확인해야 합니다. `AX-Edu` 저장소에는 앱 코드를 게시하되, GitHub 앱의 권한 부족으로 `.github/workflows/deploy.yml`과 Actions Secret은 별도 승인 전까지 등록할 수 없습니다.

## 주요 화면과 API

| 경로 | 기능 |
|---|---|
| `/` · `/login` | 소개 · Google 로그인 |
| `/dashboard` | 승인 상태, 프로필, 주차 진도, 제출물, 도구 Guide |
| `/week?id=1` | 주차 목표→학습→자료→실행과제 |
| `/assignment?id=assignment-1` | Rubric, 제출/파일/평가/재도전 |
| `/admin` | 관리자 대시보드·사용자·CMS·과제·검수·AI·시스템 |
| `/auth/google` · `/auth/callback` · `POST /auth/logout` · `GET /api/auth/status` | OAuth, 세션, 로그인 설정 상태 |
| `GET /api/me`, `PUT /api/me/profile` | 사용자 정보와 프로필 |
| `GET /api/weeks`, `GET /api/weeks/:id`, `GET /api/guides` | 교육과 Guide |
| `GET /api/assignments/:id`, `POST /api/assignments/:id/submissions` | 과제·제출 |
| `GET /api/submissions`, `POST /api/submissions/:id/appeal` | 제출 목록·이의 신청 |
| `POST /api/files?type=PDF&owner=RESOURCE`, `GET /api/files/:id` | 비공개 파일 |
| `/api/admin/overview`, `/api/admin/users`, `/api/admin/users/:id/progress` | 운영 현황 |
| `/api/admin/weeks`, `/api/admin/lessons`, `/api/admin/resources`, `/api/admin/assignments` | CMS (GET/POST/PUT) |
| `/api/admin/reviews`, `/api/admin/reviews/:id/pass` · `/retry` · `/reevaluate` | 검수 |
| `/api/admin/settings/ai` · `/test`, `/api/admin/settings/uploads` | 운영 설정 |

API 응답은 `{ "ok": true, "data": ... }` 또는 `{ "ok": false, "error": { "code": ..., "message": ... } }`입니다. 쓰기 요청에는 동일 출처 Origin이 필요합니다.

## 데이터 모델과 흐름

D1: `users`, `sessions`, `oauth_states`, `weeks`, `lessons`, `resources`, `assignments`, `assignment_rubrics`, `submissions`, `submission_files`, `files`, `evaluations`, `user_week_progress`, `app_settings`, `audit_logs`. R2는 원본 파일만 저장하며 공개 URL을 사용하지 않습니다. 파일 ID를 통한 읽기는 Worker가 소유권/주차 접근권한을 검사합니다. 주차의 **필수 과제 모두 PASS**하면 다음 주가 열립니다.

## 확인한 로컬 시나리오

- PENDING 사용자는 `/api/weeks` 접근 거부 → 관리자 승인 후 접근 가능
- Week 2 잠금 → Week 1 제출·관리자 PASS 85점 → Week 2 해금
- Week 2 제출·RETRY 68점 → Week 3 잠금 유지 → 2차 제출·PASS 88점 → Week 3 해금
- 관리자 PDF 업로드 성공, 일반 사용자 관리자 API 거부, 다른 Origin 쓰기 요청 거부
- 공개 페이지와 로그인 페이지 브라우저 로딩 확인

실제 Google/OAuth·OpenAI AI 채점·원격 R2/대용량 MP4는 운영 Secret 및 실계정으로 **추가 검증 필요**합니다. 로컬 검증은 AI 평가가 비활성일 때 제출물이 관리자 검수로 들어가는 경로를 사용했습니다.

## 아직 구현하지 않은 기능 / 다음 단계

- 실시간 강의, 결제, 커뮤니티, Vector DB 등은 의도적으로 제외했습니다.
- 실제 운영 전 Google 계정 OAuth 콜백/AI 자동채점/HYBRID 경계값/100MB 파일을 통합 테스트하세요. GitHub 앱의 Workflows 쓰기 및 Actions Secrets 관리 권한이 확보돼야 CI/CD를 활성화할 수 있습니다.
- 콘텐츠의 기본 Seed는 예시 문구입니다. 관리자가 현장별 교육 내용·영상·PDF·Rubric을 검토해 채워야 합니다.
- 향후 Cohort/수료증/직무별 과제는 별도 migration으로 확장합니다.
