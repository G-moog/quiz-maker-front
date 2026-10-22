// 본문 모양 시험: textModel(제목 줄·빈칸 번호·덩어리 나누기) — 풀기 화면 TableAwareText 가 그대로 그린다.
// 실행: npm run test:app  (화면·서버 없이 함수만 부름)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingKind, textModel } from '../../src/utils/textBlocks.js';

// 노션 페이지 빈칸 문항과 같은 꼴: 《제목》 · ■ 절 · □ 소제목 · 표 · 제목 줄 안의 빈칸
const PAGE = [
  '《pH가 작물에 미치는 영향》',
  '',
  '이 페이지에서 답하는 질문 ___ 과 ___',
  '■ 먼저 알아 둘 말',
  '',
  '| 말 | 뜻 |',
  '| pH | ___ 이 중성 |',
  '| ___ | 숫자 1 차이가 10배 |',
  '□ 1. 기초: pH 한 칸은 ___배',
  '본문 ___ 끝.',
  '■ 출처',
  '- 《책 이름》 같은 줄은 제목이 아님',
].join('\n');

test('제목 줄 종류: 《제목》은 첫 줄만, ■ 절, □ 소제목, 표 줄·보통 줄은 아님', () => {
  assert.equal(headingKind('《제목》', true), 'title');
  assert.equal(headingKind('《제목》', false), null);
  assert.equal(headingKind('■ 먼저 알아 둘 말'), 'h1');
  assert.equal(headingKind('□ 1. 기초: pH 한 칸은 10배'), 'h2');
  assert.equal(headingKind('■먼저'), null); // 띄어쓰기 없는 것은 제목 표시가 아님
  assert.equal(headingKind('| ■ 칸 |'), null);
  assert.equal(headingKind(''), null);
});

test('textModel: 빈칸 번호는 글 순서 그대로(표 칸 포함) — 제목을 나눠 그려도 answers[i] 와 같은 번호', () => {
  const m = textModel(PAGE);
  assert.equal(m.blankCount, (PAGE.match(/___/g) || []).length);
  // 블록·덩어리·칸을 차례로 돌며 start 가 0,1,2… 로 빈틈없이 이어지는지
  let next = 0;
  for (const b of m.blocks) {
    if (b.type === 'table') {
      assert.equal(b.start, next);
      for (const row of b.cells) for (const c of row) {
        assert.equal(c.start, next);
        next += c.parts.length - 1;
      }
    } else {
      for (const l of b.segs) {
        assert.equal(l.start, next);
        assert.equal(l.count, l.parts.length - 1);
        next += l.count;
      }
    }
  }
  assert.equal(next, m.blankCount);
  // 덩어리를 이어 붙이면 원래 글(블록 앞뒤 빈 줄만 빠짐)
  const textBlocks = m.blocks.filter((b) => b.type === 'text').map((b) => b.segs.map((l) => l.parts.join('___')).join(''));
  assert.equal(textBlocks[0], '《pH가 작물에 미치는 영향》\n\n이 페이지에서 답하는 질문 ___ 과 ___\n■ 먼저 알아 둘 말');
});

test('textModel.headings: 번호·종류·제목 앞 빈칸 수·목차 글', () => {
  const { headings } = textModel(PAGE);
  assert.deepEqual(headings.map((h) => [h.kind, h.hid, h.blank, h.label]), [
    ['title', 0, 0, 'pH가 작물에 미치는 영향'],
    ['h1', 1, 2, '먼저 알아 둘 말'],
    ['h2', 2, 4, '1. 기초: pH 한 칸은 (  )배'],
    ['h1', 3, 6, '출처'],
  ]);
});

test('textModel: 첫 줄이 표면 《》 줄도 제목이 아님', () => {
  const m = textModel('| a | b |\n《제목 아님》\n■ 절');
  assert.deepEqual(m.headings.map((h) => h.kind), ['h1']);
});

test('textModel 덩어리: 제목 줄은 한 덩어리, 보통 줄은 이어 붙이고 빈칸 8개가 되면 끊음', () => {
  const lines = ['■ 절', ...Array.from({ length: 10 }, (_, i) => `줄${i} ___`), '□ 소제목', '끝 줄'];
  const m = textModel(lines.join('\n'));
  const segs = m.blocks[0].segs;
  assert.deepEqual(segs.map((s) => [s.kind, s.start, s.count]), [
    ['h1', 0, 0], [null, 0, 8], [null, 8, 2], ['h2', 10, 0], [null, 10, 0],
  ]);
  // 덩어리 안 글은 줄바꿈째 이어 붙임(마지막 줄만 줄바꿈 없음)
  assert.equal(segs[2].parts.join('___'), '줄8 ___\n줄9 ___\n');
  assert.equal(segs[4].parts.join('___'), '끝 줄');
});
