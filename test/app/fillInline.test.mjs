// 빈칸 문항 편집 글 '{{정답}}' ↔ 저장 꼴(___ + 정답 배열) 시험(src/utils/fillInline.js)
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillLockReason, fromInline, toInline } from '../../src/utils/fillInline.js';

const roundTrip = (text, answers) => {
  const { inline } = toInline(text, answers);
  const back = fromInline(inline);
  assert.equal(back.ok, true, back.error);
  assert.equal(back.text, text);
  assert.deepEqual(back.answers, answers);
};

test('toInline: 빈칸 순서대로 정답을 넣는다', () => {
  const r = toInline('가식 뒤 ___ 을 덮고 ___cm 간격', ['흙', '30']);
  assert.equal(r.inline, '가식 뒤 {{흙}} 을 덮고 {{30}}cm 간격');
  assert.equal(r.blanks, 2);
  assert.deepEqual(r.extra, []);
});

test('toInline: 정답이 모자라면 {{}}, 남으면 extra 로 알린다', () => {
  assert.equal(toInline('___ ___', ['a']).inline, '{{a}} {{}}');
  const r = toInline('___', ['a', 'b', 'c']);
  assert.equal(r.inline, '{{a}}');
  assert.deepEqual(r.extra, ['b', 'c']);
});

test('왕복: 표·여러 줄·밑줄 4개·특수 글자·$ 기호도 글자 하나 다르지 않게', () => {
  roundTrip('순멎이는 생장점이 ___ 현상이다.', ['멈추는']);
  roundTrip('| 기온 | RH 40% |\n| 24도 | ___ / ___ |\n\n■ 출처\nhttps://example.com/a_b', ['13.1', '1.79']);
  roundTrip('밑줄 넷 ____ 끝', ['x']); // ___ + '_'
  roundTrip('여섯 ______ 끝', ['a', 'b']);
  roundTrip('정답에 $& $1 $$ 기호 ___', ['$&']);
  roundTrip('정답 앞뒤 공백 ___', [' 공백 ']);
  roundTrip('빈칸 없음', []);
  roundTrip('', []);
  roundTrip('___', ['맨 앞과 끝']);
  roundTrip('A___B___C', ['{', '}a']); // 괄호 하나씩은 괜찮음
  roundTrip('{ ___ } 와 ___}', ['a{', 'b']);
});

test('왕복: fillLockReason 이 괜찮다고 한 글은 모두 그대로 돌아온다(여러 조합)', () => {
  const pieces = ['', 'a', '{', '}', '_', '__', ' ', '\n', '|', '{a', 'a}', '}{'];
  const ans = ['x', '{', '}a', 'a{', '{x', 'x y', '_', 'a_'];
  let checked = 0;
  for (const p1 of pieces) for (const p2 of pieces) for (const p3 of pieces) for (const a of ans) {
    const text = `${p1}___${p2}___${p3}`;
    const blanks = (text.match(/___/g) || []).length; // '_' 가 이어지면 셋이 되기도 함
    const answers = Array.from({ length: blanks }, (_, i) => (i === 0 ? a : 'z'));
    if (fillLockReason(text, answers)) continue;
    const back = fromInline(toInline(text, answers).inline);
    assert.equal(back.ok, true, JSON.stringify({ text, answers, error: back.error }));
    assert.equal(back.text, text, JSON.stringify({ text, answers }));
    assert.deepEqual(back.answers, answers, JSON.stringify({ text, answers }));
    checked++;
  }
  assert.ok(checked > 1000);
});

test('왕복: 큰 페이지(빈칸 230개)', () => {
  const answers = Array.from({ length: 230 }, (_, i) => `답${i + 1}`);
  const text = answers.map((_, i) => `줄 ${i + 1}: 값은 ___ 이다.`).join('\n');
  roundTrip(text, answers);
});

test('fromInline: 빈칸을 지우거나 끼워도 다른 빈칸의 정답이 밀리지 않는다(B2)', () => {
  const { inline } = toInline('1 ___ 2 ___ 3 ___', ['가', '나', '다']);
  // 둘째 빈칸을 그냥 글로 바꿈
  const removed = fromInline(inline.replace('{{나}}', '나'));
  assert.deepEqual(removed, { ok: true, text: '1 ___ 2 나 3 ___', answers: ['가', '다'] });
  // 첫째 앞에 새 빈칸을 끼움
  const added = fromInline(`0 {{새}} ${inline}`);
  assert.deepEqual(added.answers, ['새', '가', '나', '다']);
});

test('fromInline: 짝이 안 맞는 {{ }} 는 한국어 오류와 자리', () => {
  let r = fromInline('앞 {{정답 뒤');
  assert.equal(r.ok, false);
  assert.match(r.error, /1번째 빈칸의 '\{\{' 가 '\}\}' 로 닫히지 않았습니다/);
  assert.equal(r.at, 2);

  r = fromInline('{{가}} 그리고 나}} 끝');
  assert.equal(r.ok, false);
  assert.match(r.error, /'\}\}' 앞에 여는 '\{\{' 가 없습니다\(2번째 빈칸 근처/);

  r = fromInline('{{가 {{나}}');
  assert.equal(r.ok, false);
  assert.match(r.error, /1번째 빈칸의 '\{\{' 가 '\}\}' 로 닫히지 않았습니다/);

  r = fromInline('{{가\n나}}'); // 줄을 넘는 정답 = 닫지 않은 것
  assert.equal(r.ok, false);
  assert.match(r.error, /닫히지 않았습니다/);
});

test('fromInline: 빈 정답·___ 정답·글에 남은 ___ 는 오류', () => {
  let r = fromInline('a {{}} b');
  assert.equal(r.ok, false);
  assert.match(r.error, /1번째 빈칸의 정답이 비어 있습니다/);
  r = fromInline('{{x}} a {{  }} b');
  assert.match(r.error, /2번째 빈칸의 정답이 비어 있습니다/);
  r = fromInline('{{a___b}}');
  assert.match(r.error, /'___' 를 넣을 수 없습니다/);
  r = fromInline('{{a}} 그리고 ___ 끝');
  assert.equal(r.ok, false);
  assert.match(r.error, /글에 '___' 가 그대로 있습니다/);
  r = fromInline('__{{a}}__'); // 이어 붙은 '_' 로 빈칸이 둘이 됨
  assert.equal(r.ok, false);
  assert.match(r.error, /빈칸 수가 어긋납니다/);
});

test('fillLockReason: {{ }} 가 이미 든 글·정답, 줄바꿈 정답은 고칠 수 없다고 알림', () => {
  assert.equal(fillLockReason('보통 글 ___', ['a']), '');
  assert.notEqual(fillLockReason('수식 {{x}} ___', ['a']), '');
  assert.notEqual(fillLockReason('___', ['a}}']), '');
  assert.notEqual(fillLockReason('___', ['줄\n바꿈']), '');
  assert.notEqual(fillLockReason('___', ['a___']), '');
  assert.notEqual(fillLockReason('___', ['}']), ''); // '{{}}}' 이 되어 되돌릴 수 없음
  assert.notEqual(fillLockReason('{___', ['a']), ''); // '{{{a}}'
  assert.equal(fillLockReason('___', null), '');
});
