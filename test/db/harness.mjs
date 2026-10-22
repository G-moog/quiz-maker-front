// PGlite 시험 틀 — Supabase 흉내(supabase-mock.sql) 위에 supabase/migrations 를 돌리고,
// PostgREST 처럼 요청마다 트랜잭션 + set_config('request.jwt.claims') + SET LOCAL ROLE 로 부른다.
// 운영 Supabase·실서버에는 붙지 않는다(이 PC 메모리 안의 Postgres 만 씀).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
export const LOCK_FILE = path.join(ROOT, 'test', 'db', 'migrations.lock.json');
export const REOPEN_TEMPLATE = path.join(ROOT, 'docs', 'restore', 'reopen-import.sql');

const MOCK_SQL = readFileSync(new URL('./supabase-mock.sql', import.meta.url), 'utf8');

// 2026-10-30 전 Supabase 의 기본값: public 에 새로 만든 표·함수·시퀀스를 anon·authenticated 에 자동으로 준다.
// 마이그레이션의 명시 REVOKE/GRANT 가 이 '가장 나쁜 경우'에도 anon 을 막는지 보려고 기본으로 켠다.
const AUTO_EXPOSE_SQL = `
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

export function readMigration(name) {
  return readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

// lock 해시: BOM 을 빼고 줄바꿈을 LF 로 맞춘 뒤 sha256(Windows CRLF 작업본과 저장소 LF 가 같은 값)
export function lockHash(text) {
  const normalized = text.replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export async function runMigrations(db) {
  for (const f of migrationFiles()) {
    await db.exec(readMigration(f));
  }
}

// autoExpose: 표 자동 노출 기본값을 흉내 낼지, migrate: 마이그레이션까지 돌릴지
export async function createDb({ autoExpose = true, migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(MOCK_SQL);
  if (autoExpose) await db.exec(AUTO_EXPOSE_SQL);
  if (migrate) await runMigrations(db);
  return db;
}

// ── 부르는 사람 ─────────────────────────────────────────────
// null: 표 주인(postgres) — 대시보드·마이그레이션·GoTrue 처럼 RLS 를 거치지 않는 쪽
export const OWNER = null;
export const ANON = { role: 'anon', claims: { role: 'anon' } };

export function authed(sub, { isAnonymous = false } = {}) {
  const claims = { role: 'authenticated', aud: 'authenticated', is_anonymous: isAnonymous };
  if (sub) claims.sub = sub;
  return { role: 'authenticated', sub, claims };
}

// 한 요청 = 한 트랜잭션(PostgREST 와 같은 꼴). 오류면 되돌리고 그대로 던진다.
// readOnly: PostgREST 는 STABLE·IMMUTABLE 함수를 읽기 전용 트랜잭션으로 부른다(POST 여도) — rpc() 가 그때 켠다
export async function sql(db, who, text, params = [], { readOnly = false } = {}) {
  return db.transaction(async (tx) => {
    if (readOnly) await tx.exec('set transaction read only');
    if (who) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(who.claims)]);
      await tx.exec(`set local role ${who.role}`);
    }
    const r = await tx.query(text, params);
    return r.rows;
  });
}

// 함수가 STABLE·IMMUTABLE 인지(이름 하나에 정의가 여럿이면 하나라도 VOLATILE 이면 아님) — db 마다 기억
const readOnlyCache = new WeakMap();
async function isReadOnlyFn(db, fn) {
  let m = readOnlyCache.get(db);
  if (!m) { m = new Map(); readOnlyCache.set(db, m); }
  if (!m.has(fn)) {
    const rows = await sql(db, OWNER, `
      select bool_and(p.provolatile in ('s', 'i')) as ro
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1`, [fn]);
    m.set(fn, rows[0]?.ro === true);
  }
  return m.get(fn);
}

// rpc(db, who, 'qm_create_set', { p_title: '…' }) → 함수 결과(jsonb 는 JS 값으로)
// STABLE 함수는 운영(PostgREST)처럼 읽기 전용 트랜잭션에서 부른다 — 안에 쓰기가 있으면 25006 으로 실패해 시험이 잡는다
export async function rpc(db, who, fn, args = {}) {
  const keys = Object.keys(args);
  const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  const params = keys.map((k) => {
    const v = args[k];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const rows = await sql(db, who, call, params, { readOnly: await isReadOnlyFn(db, fn) });
  return rows[0].r;
}

// ── 사용자 만들기 ───────────────────────────────────────────
export async function addAuthUser(db, { id = randomUUID(), email = null, isAnonymous = false } = {}) {
  await sql(db, OWNER, 'insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)', [id, email, isAnonymous]);
  return id;
}

// Auth 사용자 + 프로필을 표 주인으로 바로 넣는다(사용자 둘 시험용, bootstrap 을 거치지 않음)
export async function addUser(db, username, { role = 'USER', isAnonymous = false } = {}) {
  const id = await addAuthUser(db, { isAnonymous });
  await sql(db, OWNER, 'insert into public.profiles (id, username, nickname, role) values ($1, $2, $2, $3)', [id, username, role]);
  return authed(id, { isAnonymous });
}

// 운영과 같은 길: Auth 사용자 1명 → 그 사람이 qm_bootstrap_admin
// 아이디는 가짜 이름이다. 실제 아이디는 공개 저장소에 적지 않는다(설계서 2.2·2.5절).
export async function bootstrapAdmin(db, username = 'admin-user') {
  const id = await addAuthUser(db);
  const who = authed(id);
  const r = await rpc(db, who, 'qm_bootstrap_admin', { p_username: username });
  assert.equal(r.created, true);
  return who;
}

// ── 단언 ───────────────────────────────────────────────────
// SQLSTATE 와 (주면) 문구가 같은 오류로 실패하는지 보고, 그 오류를 돌려준다.
export async function expectError(promise, code, message) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  assert.ok(err, `오류를 기대했는데 성공했습니다 (기대 코드 ${code})`);
  assert.equal(err.code, code, `오류 코드가 다릅니다: ${err.code} ${err.message}`);
  if (message instanceof RegExp) assert.match(err.message, message);
  else if (message !== undefined) assert.equal(err.message, message);
  return err;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 스키마 상태 지문(함수 정의·권한, 표·칸 권한, 정책, 트리거, 색인, 제약, 설정 줄, 버킷) — 멱등 확인용
export async function catalogSnapshot(db) {
  const q = (text) => sql(db, OWNER, text);
  return {
    functions: await q(`
      select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
             p.proacl::text as acl, p.prosecdef as secdef, p.proconfig::text as config,
             md5(pg_get_functiondef(p.oid)) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'qm_private')
       order by sig`),
    relations: await q(`
      select c.oid::regclass::text as rel, c.relkind::text as kind, c.relacl::text as acl, c.relrowsecurity as rls
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'qm_private')
       order by rel`),
    columns: await q(`
      select a.attrelid::regclass::text as rel, a.attname::text as col, a.attacl::text as acl
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and a.attacl is not null
       order by rel, col`),
    policies: await q(`
      select schemaname::text, tablename::text, policyname::text, cmd, roles::text, qual, with_check
        from pg_policies where schemaname in ('public', 'storage')
       order by 1, 2, 3`),
    triggers: await q(`
      select tgrelid::regclass::text as rel, tgname::text as name, tgenabled::text as enabled, tgtype
        from pg_trigger where not tgisinternal order by 1, 2`),
    indexes: await q(`select indexname::text, indexdef from pg_indexes where schemaname = 'public' order by 1`),
    constraints: await q(`
      select conrelid::regclass::text as rel, conname::text as name, pg_get_constraintdef(oid) as def
        from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    schemas: await q(`select nspname::text, nspacl::text from pg_namespace where nspname in ('public', 'qm_private') order by 1`),
    defaultAcl: await q(`
      select defaclrole::regrole::text as role,
             case when defaclnamespace = 0 then '(전역)' else defaclnamespace::regnamespace::text end as nsp,
             defaclobjtype::text as kind, defaclacl::text as acl
        from pg_default_acl order by 1, 2, 3`),
    settings: await q('select * from public.qm_settings'),
    buckets: await q('select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id'),
  };
}
