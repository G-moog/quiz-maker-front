# supabase/ — quiz-maker DB 스키마

quiz-maker 의 Postgres 스키마(표·함수·권한·RLS·그림 버킷)입니다. 서버 코드는 없고, 앱과 문제 등록 도구가 이 함수들(`qm_*`)을 RPC 로 부릅니다.
이 폴더는 **스키마만** 담습니다. 데이터·이메일·비밀값은 넣지 않습니다(공개 저장소).

| 파일 | 내용 | 끝나면 schema_version |
|---|---|---|
| `migrations/20261023000100_qm_tables.sql` | 표, 색인, 설정 표, 트리거, 칸 단위 GRANT, RLS | 1 |
| `migrations/20261023000200_qm_api.sql` | 옛 API 와 짝인 함수, 실행 권한 | 2 |
| `migrations/20261023000300_qm_import.sql` | 계정 준비·옮기기·상태 함수, 실행 권한 | 3 |
| `migrations/20261023000400_qm_storage.sql` | 그림 버킷 `question-images` 와 올리기 정책 | 4 |
| `migrations/20261023000500_qm_safeupdate.sql` | Supabase pg-safeupdate 맞춤(함수 안 UPDATE 에 WHERE) | 5 |
| `../docs/restore/reopen-import.sql` | 복원 때만 쓰는 '옮기기 다시 열기' 틀(마이그레이션 아님) | — |

## 시험

```
npm run test:db
```

- PGlite(메모리 안의 Postgres)에 Supabase 흉내(`test/db/supabase-mock.sql`: 역할 anon·authenticated, `auth.uid()`·`auth.jwt()`, storage)를 깔고 마이그레이션 5개를 **두 번** 돌린 뒤 시나리오를 시험합니다. 운영 Supabase 에는 붙지 않습니다.
- `test/db/migrations.lock.json` 에 마이그레이션 파일의 해시가 있습니다. 파일 내용이 바뀌거나, 파일이 사라지거나, lock 에 없는 파일이 생기면 시험이 실패합니다.
  - 새 파일을 더한 뒤: `node test/db/lock.mjs --add` (이미 있는 줄은 바꾸지 않음)
  - 지금 상태 보기: `node test/db/lock.mjs`

## 운용 규칙 (설계서 7.2절)

GitHub 연동(Deploy to production)이 켜진 뒤에는 **master 에 올리는 것이 곧 운영 DB 에서 소유자 권한으로 SQL 을 실행하는 것**입니다.

**올리기 전**

1. 백업: 마이그레이션이 든 커밋을 올리기 전에 24시간 안의 도구 `backup` 이 있어야 합니다(전환 뒤 필수, 전환 전에는 권함).
2. `supabase/` 아래가 바뀐 push 는 승인 전에 그 diff 를 사용자에게 보여 드립니다.
3. **적용된 파일은 고치지도, 지우지도, 이름을 바꾸지도 않습니다.** GitHub 연동은 이력에 없는 파일만 적용하므로, 고치면 조용히 반영되지 않고 지우거나 이름을 바꾸면 이후 배포가 실패합니다. 바꿀 것은 늘 가장 늦은 시각 접두어를 단 새 파일로 냅니다.
   - 운영에 아직 한 번도 적용되지 않은 파일만 고칠 수 있습니다. 그때는 lock 의 그 줄을 손으로 지우고 `node test/db/lock.mjs --add` 로 다시 더합니다.
4. 함수 인자가 바뀌면 같은 새 파일에 `drop function if exists <옛 서명>;` 을 넣습니다. `create or replace` 는 인자가 다르면 덮어쓰지 않고 함수를 하나 더 만들어(overload) PGRST203 오류나 옛 앱 고장이 납니다.
5. 지금 배포된 앱과도 맞아야 합니다. 마이그레이션은 더하기만 하고, 칸·함수 지우기는 앱이 그것을 쓰지 않게 된 다음 판에서 합니다.
6. `config.toml` 에는 `[remotes]`·`[storage.buckets]` 를 두지 않습니다(Auth 기본값이 운영에 적용되어 끈 가입이 다시 켜질 수 있음).
7. 파일은 다시 돌려도 같은 결과가 나오게 씁니다: `create table if not exists`, `create or replace function`, 정책·트리거는 `drop … if exists` 뒤 `create`, 칸은 `add column if not exists`, 파일 끝마다 `update public.qm_settings set schema_version = greatest(schema_version, N);`. `create index concurrently` 처럼 트랜잭션 밖에서만 도는 문장은 쓰지 않습니다.
8. 새 표·함수를 만들면 권한을 명시합니다: 표는 `revoke all … from anon, authenticated` 뒤 필요한 칸만 GRANT 하고 RLS 를 켭니다. 함수는 이름과 상관없이 `revoke execute … from public, anon` 뒤 `grant execute … to authenticated` (anon 은 `qm_schema_version` 하나만).
   - 100 파일이 기본 권한을 거둬 두었으므로(`alter default privileges`), 권한을 빠뜨려도 새 함수·표·시퀀스가 anon 에 열리지는 않습니다. 대신 authenticated 에도 저절로 열리지 않을 수 있으니(표 자동 노출이 꺼진 프로젝트) GRANT 를 꼭 적습니다. 전역 줄 때문에 마이그레이션 역할이 다른 스키마에 만드는 함수도 PUBLIC 실행 권한이 없습니다.
   - `npm run test:db` 의 시험 9 는 public·qm_private 의 **모든** 함수·표·뷰·시퀀스를 보고, anon 에 열린 것이 `qm_schema_version` 하나뿐인지 확인합니다.

**올릴 때**

9. 마이그레이션만 담은 커밋을 먼저 master 에 올립니다. 사용자가 직접 push 해야 하면 `git push origin <마이그레이션 커밋 sha>:master` 한 줄만 안내합니다.
10. GitHub master 에 보호 규칙(강제 push 금지, 삭제 금지)을 켭니다(사용자, 한 번).

**올린 뒤**

11. 공개 키로 `rpc qm_schema_version` 을 불러 기대한 판인지 확인합니다.
12. 같은 때 anon(공개 키, 로그인 없음)으로 마이그레이션 파일에 나오는 public 의 함수 **전부**(이름이 `qm_` 가 아니어도, `qm_schema_version` 만 예외)와 표·뷰 전부(지금은 `qm_settings`, `profiles`, `question_sets`, `questions`, `question_notes`)가 **모두 401** 인지 봅니다. 목록은 파일의 `create function public.…`·`create table public.…`·`create view public.…` 에서 빠짐없이 뽑습니다.
    - 처음 적용할 때(2단계)는 다음도 확인합니다: 앱 로그인으로 그림 한 장 올리기(`upsert: false`)가 되는지(막히면 새 파일로 자기 폴더 SELECT 정책을 더함), 도구 login 의 계정 준비(`qm_bootstrap_admin`)가 되는지(= 소유자 권한 함수가 `auth.users` 와 그 `is_anonymous` 칸을 읽음).
13. 그다음 앱 코드 커밋을 올립니다. 순서가 어긋나도 앱은 `schemaVersion` 을 보고 '서버 준비 중'을 띄웁니다.
14. 판이 오르지 않으면 대시보드 Integrations 화면과 GitHub 커밋 상태를 보고, CLI(`db push`, 사용자 터미널) → 내장 브라우저 SQL Editor(마지막 수단, 설계서 7.1절 G 규칙) 순으로 같은 SQL 을 적용합니다(멱등).

**늘**

- 운영 프로젝트에 시험 사용자를 만들지 않습니다(계정 준비는 'Auth 사용자 정확히 1명'일 때만 됨).
- 대시보드 Authentication → Users 에서 관리자 사용자(계정 준비로 ADMIN 이 된 사용자)를 지우지 않습니다. 데이터가 있으면 외래키(restrict)가 막지만, 막힌 것을 우회하려고 다른 일을 하지 않습니다.
- 복원은 `docs/restore/reopen-import.sql` 의 머리말 순서대로 합니다(설계서 6.5절).
- 비우기(`qm_import_reset`)의 DB 안전장치: **마지막 비우기 뒤**(처음이면 처음부터) 세 표에 사용자 쓰기가 한 번이라도 있었으면 `p_discard_changes` 없이는 QM409 입니다. 넣기 끝(finish) 시각과는 상관없습니다. 비우면 그 기록도 지워집니다.
  - 바뀐 행이 0인 쓰기 문장(직접 REST 의 빈 DELETE 등)도 기록되므로, QM409 가 나와도 실제로 바뀐 행이 없을 수 있습니다. 도구의 해시 대조가 같다고 하면 `--discard-changes` 로 진행합니다.
  - 넣는 동안(reset ~ finish)에는 앱·도구로 쓰지 않습니다. 그 사이 시퀀스는 아직 처음 값이라 새로 쓰면 옮긴 번호와 부딪혀 실패합니다(23505, 데이터는 그대로).
