// 뒤로 가기 처리(src/utils/backStack.js) 시험 — 가짜 window·history 로(화면 없이).
// 가짜 history 는 브라우저처럼 go() 의 popstate 를 다음 차례(비동기)에 보낸다. 사용자 뒤로 가기 = go(-1).
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';

let modSeq = 0;
const tick = () => new Promise((r) => setTimeout(r, 5));

// 시험마다 새 window 와 새 모듈(쌓인 칸·popstate 듣기가 모듈 안에 있음)
async function setup() {
  const listeners = new Set();
  const entries = [{ state: null }];
  let index = 0;
  const log = [];
  const history = {
    pushState(state) {
      entries.splice(index + 1);
      entries.push({ state });
      index++;
      log.push('push');
    },
    go(n) {
      log.push(`go(${n})`);
      setTimeout(() => {
        const t = Math.max(0, Math.min(entries.length - 1, index + n));
        if (t === index) return;
        index = t;
        for (const l of listeners) l({ state: entries[index].state });
      }, 0);
    },
  };
  globalThis.window = {
    history,
    addEventListener(type, fn) { if (type === 'popstate') listeners.add(fn); },
  };
  const mod = await import(`../../src/utils/backStack.js?t=${++modSeq}`);
  return {
    ...mod,
    log,
    get index() { return index; },
    get length() { return entries.length; },
    userBack: () => history.go(-1),
  };
}

function counter(ret) {
  const f = () => { f.calls++; return ret; };
  f.calls = 0;
  return f;
}

test('pushBack: 칸마다 history 에 한 칸씩 쌓는다', async () => {
  const h = await setup();
  h.pushBack(counter());
  assert.equal(h.index, 1);
  h.pushBack(counter());
  assert.equal(h.index, 2);
  assert.deepEqual(h.log, ['push', 'push']);
});

test('사용자 뒤로 가기: 가장 위의 닫는 함수만, 한 번씩', async () => {
  const h = await setup();
  const a = counter();
  const b = counter();
  h.pushBack(a);
  h.pushBack(b);
  h.userBack();
  await tick();
  assert.equal(b.calls, 1);
  assert.equal(a.calls, 0);
  assert.equal(h.index, 1);
  h.userBack();
  await tick();
  assert.equal(a.calls, 1);
  assert.equal(b.calls, 1);
  assert.equal(h.index, 0);
  // 쌓인 칸이 없으면 아무것도 부르지 않음
  h.userBack();
  await tick();
  assert.equal(a.calls + b.calls, 2);
});

test('앱 단추로 닫기(release): history.go(-1) 로 걷고, 그 popstate 는 닫는 함수를 부르지 않는다', async () => {
  const h = await setup();
  const a = counter();
  const release = h.pushBack(a);
  release();
  release(); // 두 번 불러도 한 번만
  await tick();
  assert.equal(h.index, 0);
  assert.equal(a.calls, 0);
  assert.deepEqual(h.log, ['push', 'go(-1)']);
  // 걷은 뒤 새 칸은 정상
  const b = counter();
  h.pushBack(b);
  assert.equal(h.index, 1);
  h.userBack();
  await tick();
  assert.equal(b.calls, 1);
});

test('뒤로 가기로 이미 빠진 칸의 release 는 아무 일도 안 함', async () => {
  const h = await setup();
  const a = counter();
  const release = h.pushBack(a);
  h.userBack();
  await tick();
  assert.equal(a.calls, 1);
  release();
  await tick();
  assert.deepEqual(h.log, ['push', 'go(-1)']); // 사용자 뒤로 가기 한 번뿐(앱이 더 걷지 않음)
  assert.equal(h.index, 0);
});

test('부모 release: 위에 쌓인 자식 칸까지 history.go 한 번으로 걷는다(자식 닫는 함수는 부르지 않음)', async () => {
  const h = await setup();
  const parent = counter();
  const child = counter();
  const releaseParent = h.pushBack(parent);
  h.pushBack(child);
  assert.equal(h.index, 2);
  releaseParent();
  await tick();
  assert.deepEqual(h.log, ['push', 'push', 'go(-2)']);
  assert.equal(h.index, 0);
  assert.equal(parent.calls + child.calls, 0);
});

test('같은 차례의 release 여러 번(자식 먼저 → 부모)도 history.go 한 번', async () => {
  const h = await setup();
  const releaseParent = h.pushBack(counter());
  const releaseChild = h.pushBack(counter());
  // React 가 화면을 내릴 때 자식 효과 정리가 먼저 돈다
  releaseChild();
  releaseParent();
  await tick();
  assert.deepEqual(h.log, ['push', 'push', 'go(-2)']);
  assert.equal(h.index, 0);
});

test('걷어 내는 중(popstate 전)에 새 칸을 쌓으면 popstate 뒤로 미룬다', async () => {
  const h = await setup();
  const a = counter();
  const b = counter();
  const releaseA = h.pushBack(a);
  releaseA();
  h.pushBack(b); // 같은 차례: 아직 go 도 안 부름
  assert.deepEqual(h.log, ['push']);
  await tick();
  assert.deepEqual(h.log, ['push', 'go(-1)', 'push']);
  assert.equal(h.index, 1);
  assert.equal(h.length, 2); // 옛 칸 자리에 새 칸
  // 새 칸은 사용자 뒤로 가기에 정상으로 닫힘(무시되지 않음)
  h.userBack();
  await tick();
  assert.equal(b.calls, 1);
  assert.equal(a.calls, 0);
});

test('go 를 부른 뒤 popstate 를 기다리는 중에 쌓은 칸도 뒤로 미룬다', async () => {
  const h = await setup();
  const releaseA = h.pushBack(counter());
  releaseA();
  await Promise.resolve(); // 마이크로태스크: go(-1) 은 불렸고 popstate 는 아직
  await Promise.resolve();
  assert.deepEqual(h.log, ['push', 'go(-1)']);
  const b = counter();
  h.pushBack(b);
  assert.deepEqual(h.log, ['push', 'go(-1)']);
  await tick();
  assert.deepEqual(h.log, ['push', 'go(-1)', 'push']);
  h.userBack();
  await tick();
  assert.equal(b.calls, 1);
});

test('닫는 함수가 STAY 를 돌려주면 칸을 다시 쌓고, 그 release 도 그대로 쓴다', async () => {
  const h = await setup();
  const parent = counter();
  const guard = counter(h.STAY);
  h.pushBack(parent);
  const release = h.pushBack(guard);
  h.userBack();
  await tick();
  assert.equal(guard.calls, 1);
  assert.equal(h.index, 2); // 다시 쌓음
  // 한 번 더 뒤로 → 다시 물음(부모는 닫히지 않음)
  h.userBack();
  await tick();
  assert.equal(guard.calls, 2);
  assert.equal(parent.calls, 0);
  assert.equal(h.index, 2);
  // 앱 단추로 닫기 → 다시 쌓은 칸이 걷힘
  release();
  await tick();
  assert.equal(h.index, 1);
  h.userBack();
  await tick();
  assert.equal(parent.calls, 1);
  assert.equal(guard.calls, 2);
});

test('useBack 감싸개도 STAY 를 그대로 넘긴다(닫는 함수의 돌려준 값)', async () => {
  const h = await setup();
  // useBack 은 pushBack(() => ref.current?.()) — 같은 꼴로 확인
  let answer = h.STAY;
  const ref = { current: () => answer };
  h.pushBack(() => ref.current?.());
  h.userBack();
  await tick();
  assert.equal(h.index, 1);
  answer = undefined;
  h.userBack();
  await tick();
  assert.equal(h.index, 0);
});
