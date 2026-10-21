# Quiz Maker (앱)

문제집을 만들고 푸는 개인 공부 앱입니다. Vite + React SPA 이고, 데이터·로그인·그림은 **Supabase**(Postgres·Auth·Storage), 배포는 **Vercel** 입니다. **서버 코드는 없습니다.** 앱이 DB 함수(`qm_*`)를 RPC 로 바로 부르고, 검사·주인 확인은 DB 안의 함수·RLS·제약이 합니다.

```
[휴대폰·탭·PC 브라우저]  Vite SPA (이 저장소)
   └ @supabase/supabase-js
       ① auth     이메일 + 비밀번호 로그인, 세션 자동 갱신, 비밀번호 재설정 메일
       ② rpc      qm_* 함수 — 데이터 전부(문제집·문항·질문 메모)
       ③ storage  새 그림 올리기(question-images 버킷)
          ▼
 Supabase 프로젝트: 표 + qm_* 함수 + RLS(내 것만) + 칸 단위 GRANT  ← supabase/migrations (master push 때 자동 적용)
 Vercel: master = 운영 배포, 다른 브랜치 = 미리보기(Vercel 로그인 필요). 환경 변수 없음
```

| 곳 | 내용 |
|---|---|
| `src/config.js` | 공개 설정(Supabase 주소·publishable 키·운영 주소 등). 환경 변수 대신 여기 둡니다. |
| `src/api/` | DB 함수 부르기. 함수 이름과 반환 모양(camelCase)은 옛 `/api` 서버와 같아서 화면 코드는 그대로입니다. 오류도 옛 서버처럼 `status 400` + 옛 한국어 문구로 옵니다. |
| `src/api/supabase.js` | 연결 하나, `call(이름, 인자)`, 오류 바꾸기(만료·서버 준비 중·쉬는 중·연결 실패) |
| `src/utils/startup.js`, `src/App.jsx` | 시작 판정(아래 '주소별 시작 화면') |
| `supabase/` | DB 스키마(마이그레이션 4개)와 운용 규칙 → [`supabase/README.md`](supabase/README.md) |
| `api/keepalive.js` | (Free 요금제일 때만) 프로젝트 정지 막기용 Vercel 함수. 크론은 아직 등록하지 않았습니다(아래). |
| `test/db/`, `test/app/` | DB 시험(PGlite), 설정·시작 판정 시험 |

## 설정 — `src/config.js` (환경 변수 없음)

Supabase 주소와 publishable 키는 공개 값이라 저장소에 그대로 둡니다. Vercel 에도 환경 변수를 넣지 않습니다.

| 이름 | 뜻 |
|---|---|
| `SUPABASE_URL` | 프로젝트 주소(`https://<ref>.supabase.co`, 경로 없이) |
| `SUPABASE_PUBLISHABLE_KEY` | **publishable 키(`sb_publishable_…`)만.** secret(`sb_secret_…`)·service_role 키와 DB 비밀번호는 이 저장소 어디에도 넣지 않습니다. |
| `PROD_HOSTS` | 운영 주소(Vercel production 도메인, 호스트 이름만). 비밀번호 재설정 링크도 여기로 돌아옵니다. |
| `LEGACY_APP_HOST` | 옛 Railway 앱 주소. 여기서 열리면 '주소가 바뀌었습니다' 화면만 보입니다. |
| `REQUIRED_SCHEMA` | 앱이 요구하는 DB 판(마지막 마이그레이션의 `schema_version`). DB 가 낮으면 '서버 준비 중'. |
| `SHOW_EXCEL` | 엑셀 단추를 보일지(기본 `false`, 아래 '엑셀'). |
| `PASSWORD_MIN_LENGTH` | 새 비밀번호 최소 길이. Supabase Authentication 의 최소 길이 설정과 같게(12). |

키 검사(`assertPublicKey`·`checkConfig`)

- 키가 publishable 꼴이 아니면(secret 키, service_role JWT, 옛 JWT 꼴 키, 그 밖) **앱은 시작하지 않고**('앱 설정이 잘못되었습니다') **빌드도 실패합니다**(`vite.config.js`). 비밀 키가 공개 번들에 실리는 것을 막으려는 것입니다.
- 주소·키가 **아직 비어 있으면**(Supabase 프로젝트를 만들기 전) 로컬·미리보기 빌드는 경고만 하고 빌드합니다. 앱은 '앱 설정이 비어 있습니다' 화면만 보입니다.
- Vercel **운영 빌드**(`VERCEL_ENV=production`, Vercel 이 스스로 넣는 값)는 주소·키가 비어 있거나 `PROD_HOSTS` 가 비어 있으면 실패합니다.

## 개발과 시험

Node 22 이상(`@supabase/supabase-js` 가 요구).

```
npm install
npm run dev        # 로컬(주소 종류는 '미리보기·로컬')
npm run lint       # 오류 0 이어야 함
npm run build      # 키 검사 포함
npm run test:app   # 공개 키 검사·시작 판정
npm run test:db    # 마이그레이션·DB 함수(PGlite, 운영 Supabase 에 붙지 않음)
```

- 펜 시험 페이지(로그인·서버 없이): 주소 끝에 `?pentest` 또는 `#pentest`.
- 로컬에서 쓰는 Supabase 는 `src/config.js` 의 그 프로젝트입니다. 전환 뒤에는 그것이 운영 데이터이므로 아래 '운영 규칙'을 따릅니다.

## 주소별 시작 화면

앱은 열릴 때 주소 종류를 보고, 세션을 확인한 뒤 `qm_me()`(이름·역할·DB 판·전환 상태)로 화면을 정합니다.

| 경우 | 화면 |
|---|---|
| 옛 Railway 주소 | '주소가 바뀌었습니다'(새 주소 링크) |
| 세션 없음 | 로그인(이메일 + 비밀번호, '비밀번호를 잊었어요') |
| 로그인 만료(갱신 실패, 다른 탭에서 로그아웃, 토큰 거절) | 로그인 + '로그인이 만료되었습니다' |
| DB 함수 없음(PGRST202) 또는 DB 판 < `REQUIRED_SCHEMA` | '서버 준비 중' |
| 540(Free 프로젝트 정지) 또는 연결 실패 + `qm_schema_version` 도 실패 | '서버가 쉬는 중입니다 → supabase.com 대시보드 → Resume project' |
| 계정 준비 전(`ready:false`) | '계정 준비 필요'(도구 `node quiz.mjs login --backend supabase` 한 번) |
| 운영 주소 + 전환 전(`live:false`) | '전환 준비 중'(데이터를 부르지 않음. 전환 날 go-live 전, 복원 중) |
| 운영 주소 + `live:true` | 앱 |
| 미리보기·로컬 + `live:false` | 앱 + 노란 띠 '리허설 사본 — 여기 쓴 것은 전환 때 지워집니다' |
| 미리보기·로컬 + `live:true` | 탭마다 '운영 데이터를 바로 읽고 씁니다' 확인 → 앱 + 붉은 띠 |
| 재설정 메일의 링크 | '새 비밀번호 정하기' |

- 세션은 supabase-js 가 이 기기의 localStorage 에 두고 만료 전에 스스로 갱신합니다(24시간마다 끊기지 않음). 로그아웃은 이 기기만 끊습니다.
- 앱 안의 이름(`localStorage.username`)은 `qm_me` 의 username(옛 아이디 그대로)입니다. 필기·하드모드·메모 초안의 열쇠라 바뀌면 안 됩니다.
- 로그인한 채 비밀번호를 바꾸려면 대시보드 머리의 이름(배지) → '비밀번호 바꾸기'.

## 배포 순서

1. **마이그레이션이 먼저.** `supabase/` 를 바꾼 커밋만 master 에 올리고(`git push origin <마이그레이션 커밋 sha>:master`), 공개 키로 `qm_schema_version` 이 기대한 판인지 확인합니다. 규칙 전체는 [`supabase/README.md`](supabase/README.md) '운용 규칙'.
2. 그다음 앱 코드. 순서가 어긋나도 앱은 DB 판을 보고 '서버 준비 중'을 띄웁니다.
3. 앱이 새 DB 판을 요구하게 되면 `src/config.js` 의 `REQUIRED_SCHEMA` 를 올립니다.

Vercel(한 번): 저장소 `G-moog/quiz-maker-front` 를 import, Framework Vite, 출력 `dist`, Node 22 이상, Production branch `master`, 환경 변수 없음.
Supabase Authentication → URL Configuration(한 번): Site URL = 운영 주소, Redirect URLs = **운영 주소 하나만**(`https://*.vercel.app/**` 같은 넓은 와일드카드는 넣지 않음).

## 운영 규칙

- **미리보기 주소도 운영 데이터를 씁니다(전환 뒤).** 쓰기 시험은 `[시험]` 문제집에서만, 지우기 시험은 가짜 서버(mock)·하네스에서만 합니다. 미리보기에서 쓰기 시험을 하기 전에는 도구 `backup` 을 먼저 받습니다.
- 전환 전 미리보기·로컬은 리허설 사본이라 전환 때 지워집니다(노란 띠).
- Supabase 대시보드 Authentication → Users 에서 사용자를 지우지 않습니다. 비밀번호를 잊으면 앱의 '비밀번호를 잊었어요'(메일은 한 시간에 2통까지). 메일이 안 오면 Users 화면의 '재설정 메일 보내기'를 씁니다. 지우고 다시 만들면 데이터가 이어지지 않습니다.
- secret·service_role 키, DB 비밀번호는 저장소·Vercel 어디에도 넣지 않습니다.

## 그림

- 새 그림: Storage 공개 버킷 `question-images` 의 `<내 uid>/<YYYYMMDD>-<uuid>.<확장자>` 로 올립니다(10 MB, jpg·png·gif·webp, 덮어쓰기 없음).
- 옛 그림: 문항에 적힌 Cloudinary 주소 그대로 보입니다. 옮기지 않으므로 **Cloudinary 계정을 지우지 않습니다**(옛 그림이 1개라도 있으면).

## 엑셀

- 옛 서버(Apache POI)가 하던 엑셀 내려받기·올리기는 새 구조에 아직 없습니다. 쓸지 정하지 않아서 `SHOW_EXCEL = false` 로 단추를 숨겼습니다(관리자여도 숨김).
- 쓰기로 하면: `src/api/excel.js` 를 브라우저 엑셀(SheetJS 를 단추를 누를 때 불러옴)로 다시 쓰고, 여러 문항 넣기 DB 함수(`qm_add_questions`·`qm_create_set_with_questions`)를 새 마이그레이션으로 더한 뒤 `SHOW_EXCEL` 을 켭니다. 그 전에 켜면 단추가 '아직 준비되지 않았습니다'만 띄웁니다.

## Free 요금제 정지 막기(만들어 두기만 함)

Supabase Free 는 7일 동안 아무도 쓰지 않으면 프로젝트를 정지합니다. `api/keepalive.js` 는 공개 값만 써서 로그인 없이 부를 수 있는 `qm_schema_version` 하나를 부르는 Vercel 함수입니다. **크론은 아직 등록하지 않았습니다**(요금제 미정). Free 로 정하면 저장소 맨 위에 `vercel.json` 을 만들어 시각을 12시간 달리한 크론 2개를 등록합니다.

```json
{
  "crons": [
    { "path": "/api/keepalive", "schedule": "0 3 * * *" },
    { "path": "/api/keepalive", "schedule": "0 15 * * *" }
  ]
}
```

- Vercel Hobby 의 크론 한도(개수·하루 1번)를 등록 전에 확인합니다.
- 이 PC 의 매일 백업(도구 `backup`, 작업 스케줄러)도 같은 역할을 합니다. Pro 를 고르면 둘 다 필요 없습니다(백업은 매주로).
- 정지되면 앱은 '서버가 쉬는 중입니다' 화면을 띄웁니다. supabase.com 대시보드 → 프로젝트 → Resume project 를 누르고 몇 분 뒤 다시 엽니다.
