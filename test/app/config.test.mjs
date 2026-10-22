// 앱 공개 설정(src/config.js)의 키 검사와 시작 판정(src/utils/startup.js) 시험(설계서 3.4·5.1·5.3절).
// 실행: npm run test:app  (화면·서버 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PROD_HOSTS, REQUIRED_SCHEMA,
  assertProdHosts, assertPublicKey, assertSupabaseUrl, checkConfig,
} from '../../src/config.js';
import { PRODUCTION_BUILD, decideAfterMe, hostKindOf, recoveryFromHash } from '../../src/utils/startup.js';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(payload)}.c2lnbmF0dXJl`;
const URL_OK = 'https://abcdefghijklmnop.supabase.co';
const KEY_OK = 'sb_publishable_AbCdEf0123456789';

test('공개 키 검사: publishable 키만 받는다', () => {
  assert.doesNotThrow(() => assertPublicKey(KEY_OK));
  assert.doesNotThrow(() => assertPublicKey(`  ${KEY_OK}  `));
  const cases = [
    ['', /비어 있습니다/],
    ['   ', /비어 있습니다/],
    [undefined, /비어 있습니다/],
    ['sb_secret_AbCdEf0123456789', /secret 키/],
    [jwt({ role: 'service_role', iss: 'supabase' }), /service_role 키/],
    [jwt({ role: 'anon', iss: 'supabase' }), /옛 JWT 꼴 키/],
    ['eyJhbGciOiJIUzI1NiJ9.not-json.sig', /sb_publishable_ 로 시작해야/],
    ['pk_live_0123456789', /sb_publishable_ 로 시작해야/],
  ];
  for (const [key, re] of cases) {
    assert.throws(() => assertPublicKey(key), re, String(key));
  }
});

test('공개 키 검사: 오류 문구에 키 값을 싣지 않는다', () => {
  const secret = 'sb_secret_DoNotLeakThisValue123';
  const service = jwt({ role: 'service_role', marker: 'DoNotLeakThisValue456' });
  for (const key of [secret, service, 'random-DoNotLeakThisValue789']) {
    try {
      assertPublicKey(key);
      assert.fail('막혀야 함');
    } catch (e) {
      assert.ok(!e.message.includes('DoNotLeakThisValue'), e.message);
    }
  }
});

test('Supabase 주소 검사: https, 경로 없음(로컬 시험만 http)', () => {
  assert.doesNotThrow(() => assertSupabaseUrl(URL_OK));
  assert.doesNotThrow(() => assertSupabaseUrl(`${URL_OK}/`));
  assert.doesNotThrow(() => assertSupabaseUrl('http://127.0.0.1:54321'));
  assert.doesNotThrow(() => assertSupabaseUrl('http://api.localhost:54321'));
  assert.throws(() => assertSupabaseUrl('abcdefghijklmnop.supabase.co'), /올바르지 않습니다/);
  assert.throws(() => assertSupabaseUrl('http://abcdefghijklmnop.supabase.co'), /https/);
  assert.throws(() => assertSupabaseUrl(`${URL_OK}/rest/v1`), /경로/);
  assert.throws(() => assertSupabaseUrl(`${URL_OK}/?x=1`), /경로/);
});

test('설정 전체 검사: 비어 있음·짝이 안 맞음·운영 빌드', () => {
  assert.deepEqual(checkConfig({ url: '', key: '' }), { empty: true });
  assert.deepEqual(checkConfig({ url: URL_OK, key: KEY_OK }), { ok: true });
  assert.match(checkConfig({ url: URL_OK, key: '' }).error, /함께 채워야/);
  assert.match(checkConfig({ url: '', key: KEY_OK }).error, /함께 채워야/);
  assert.match(checkConfig({ url: URL_OK, key: 'sb_secret_x' }).error, /secret 키/);
  assert.match(checkConfig({ url: 'ftp://x.supabase.co', key: KEY_OK }).error, /https/);
  // Vercel 운영 빌드: 비어 있어도, 운영 주소가 없어도 멈춘다
  assert.match(checkConfig({ url: '', key: '', production: true }).error, /운영 빌드인데/);
  assert.match(checkConfig({ url: URL_OK, key: KEY_OK, production: true }).error, /PROD_HOSTS/);
  assert.deepEqual(checkConfig({ url: URL_OK, key: KEY_OK, prodHosts: ['quiz-maker-xx.vercel.app'], production: true }), { ok: true });
});

test('운영 주소 꼴 검사: 호스트 이름만(스킴·경로·끝의 / ·포트 없음)', () => {
  assert.doesNotThrow(() => assertProdHosts([]));
  assert.doesNotThrow(() => assertProdHosts(['quiz-maker-xx.vercel.app', 'quiz.example.com', 'prod.localhost']));
  const bad = [
    'https://quiz-maker-xx.vercel.app',
    'quiz-maker-xx.vercel.app/',
    'https://quiz-maker-xx.vercel.app/',
    'quiz-maker-xx.vercel.app/app',
    'quiz-maker-xx.vercel.app:443',
    ' quiz-maker-xx.vercel.app',
    'localhost',
    '-bad.vercel.app',
    '',
    null,
  ];
  for (const h of bad) {
    assert.throws(() => assertProdHosts([h]), /PROD_HOSTS\[0\] 꼴이 틀렸습니다/, String(h));
  }
  assert.throws(() => assertProdHosts('quiz-maker-xx.vercel.app'), /배열이어야/);
  // 설정 전체 검사도 운영 주소 꼴을 본다 — 비어 있는 설정·운영 빌드 어느 쪽이든
  const prodHosts = ['https://quiz-maker-xx.vercel.app/'];
  assert.match(checkConfig({ url: URL_OK, key: KEY_OK, prodHosts, production: true }).error, /PROD_HOSTS\[0\]/);
  assert.match(checkConfig({ url: URL_OK, key: KEY_OK, prodHosts }).error, /PROD_HOSTS\[0\]/);
  assert.match(checkConfig({ url: '', key: '', prodHosts }).error, /PROD_HOSTS\[0\]/);
});

test('저장소의 지금 설정값은 검사를 통과하거나 아직 비어 있다(비밀 키가 들어가 있지 않음)', () => {
  const r = checkConfig({ url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY, prodHosts: PROD_HOSTS });
  assert.ok(r.ok || r.empty, JSON.stringify(r));
  assert.ok(!String(SUPABASE_PUBLISHABLE_KEY).startsWith('sb_secret_'));
  assert.ok(Array.isArray(PROD_HOSTS));
  assert.equal(REQUIRED_SCHEMA, 5);
});

test('주소 종류: 운영 · 옛 Railway · 그 밖(미리보기·로컬)', () => {
  const opts = { prodHosts: ['quiz-maker-xx.vercel.app'], legacyHost: 'quiz-maker.up.railway.app' };
  assert.equal(hostKindOf('quiz-maker-xx.vercel.app', opts), 'prod');
  assert.equal(hostKindOf('Quiz-Maker-XX.vercel.app', opts), 'prod');
  assert.equal(hostKindOf('quiz-maker.up.railway.app', opts), 'legacy');
  assert.equal(hostKindOf('quiz-maker-git-supabase-g-moog.vercel.app', opts), 'preview');
  assert.equal(hostKindOf('localhost', opts), 'preview');
  assert.equal(hostKindOf('localhost', { prodHosts: [], legacyHost: 'quiz-maker.up.railway.app' }), 'preview');
});

test('주소 종류: Vercel 운영 빌드는 어느 주소로 열어도 운영(git-master 별칭·배포별 주소)', () => {
  // Node 시험에는 빌드 표시가 없다 → 운영 빌드 아님
  assert.equal(PRODUCTION_BUILD, false);
  const opts = { prodHosts: ['quiz-maker-xx.vercel.app'], legacyHost: 'quiz-maker.up.railway.app', productionBuild: true };
  assert.equal(hostKindOf('quiz-maker-xx.vercel.app', opts), 'prod');
  assert.equal(hostKindOf('quiz-maker-xx-git-master-g-moog.vercel.app', opts), 'prod');
  assert.equal(hostKindOf('quiz-maker-xx-a1b2c3d4e-g-moog.vercel.app', opts), 'prod');
  // 옛 Railway 주소는 빌드와 상관없이 옛 주소
  assert.equal(hostKindOf('quiz-maker.up.railway.app', opts), 'legacy');
  // 운영 빌드가 아니면 주소로만 정한다
  assert.equal(hostKindOf('quiz-maker-xx-git-master-g-moog.vercel.app', { ...opts, productionBuild: false }), 'preview');
});

test('qm_me 결과 → 화면(설계서 3.4절 순서)', () => {
  const me = (o) => ({ ready: true, username: 'admin-user', role: 'ADMIN', schemaVersion: 5, live: false, ...o });
  assert.deepEqual(decideAfterMe(null, 'prod', 4), { screen: 'error' });
  // 판이 낮으면 계정·live 보다 먼저 '서버 준비 중'
  assert.deepEqual(decideAfterMe(me({ schemaVersion: 3 }), 'preview', 4), { screen: 'not-ready' });
  assert.deepEqual(decideAfterMe(me({ schemaVersion: null, ready: false }), 'preview', 4), { screen: 'not-ready' });
  // 계정 준비 전(live 는 null 로 옴)
  assert.deepEqual(decideAfterMe(me({ ready: false, username: null, role: null, live: null }), 'prod', 4), { screen: 'account' });
  // 운영 주소: live 일 때만 앱, 그 전에는 '전환 준비 중'
  assert.deepEqual(decideAfterMe(me({ live: false }), 'prod', 4), { screen: 'cutover' });
  assert.deepEqual(decideAfterMe(me({ live: null }), 'prod', 4), { screen: 'cutover' });
  assert.deepEqual(decideAfterMe(me({ live: true }), 'prod', 4), { screen: 'app', band: null });
  // 미리보기·로컬: 전환 전은 리허설 띠, 전환 뒤는 확인 뒤 붉은 띠
  assert.deepEqual(decideAfterMe(me({ live: false }), 'preview', 4), { screen: 'app', band: 'rehearsal' });
  assert.deepEqual(decideAfterMe(me({ live: true }), 'preview', 4), { screen: 'confirm-preview', band: 'live-preview' });
  // 판이 요구판보다 높아도 됨
  assert.deepEqual(decideAfterMe(me({ schemaVersion: 5, live: true }), 'prod', 4), { screen: 'app', band: null });
});

test('재설정 링크 주소(#…) 읽기', () => {
  assert.equal(recoveryFromHash('#access_token=a.b.c&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery'), 'recovery');
  assert.equal(recoveryFromHash('#access_token=a.b.c&type=signup'), null);
  assert.equal(recoveryFromHash('#type=recovery'), null);
  assert.deepEqual(
    recoveryFromHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    { error: 'Email link is invalid or has expired' },
  );
  assert.equal(recoveryFromHash(''), null);
  assert.equal(recoveryFromHash('#pentest'), null);
});

test('vercel.json CSP 가 지금 Supabase 주소를 허용한다(주소를 바꾸면 CSP 도 함께)', async () => {
  const { readFileSync } = await import('node:fs');
  const { cspProblem } = await import('../../src/config.js');
  const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.equal(cspProblem(vercel, SUPABASE_URL), null);
  assert.match(cspProblem(vercel, 'https://other-project-ref.supabase.co'), /connect-src/);
  assert.match(cspProblem({ headers: [] }, SUPABASE_URL), /Content-Security-Policy 가 없습니다/);
  assert.equal(cspProblem(vercel, ''), null);
  // 크론은 정지 막기 함수 하나를 하루 1번씩(Hobby 한도) 부른다
  const crons = vercel.crons || [];
  assert.ok(crons.length >= 1 && crons.every((c) => c.path === '/api/keepalive' && /^\d+ \d+ \* \* \*$/.test(c.schedule)), JSON.stringify(crons));
});
