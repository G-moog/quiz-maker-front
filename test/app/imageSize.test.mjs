// 그림 올리기 전 줄이기의 셈(src/utils/imageSize.js) 시험
// 실행: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEEP_PNG_MAX_BYTES, MAX_INPUT_BYTES, MAX_SIDE, SHRINK_OVER_BYTES, fitWithin, keepOriginal, needsShrink, pickOutputType,
} from '../../src/utils/imageSize.js';

const MB = 1024 * 1024;

test('fitWithin: 긴 변을 1600px 안으로, 비율 그대로, 늘리지 않음', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200, scaled: true });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600, scaled: true }); // 세로 사진
  assert.deepEqual(fitWithin(1600, 900), { width: 1600, height: 900, scaled: false });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600, scaled: false });
  assert.deepEqual(fitWithin(1601, 10), { width: 1600, height: 10, scaled: true });
  assert.deepEqual(fitWithin(9000, 2), { width: 1600, height: 1, scaled: true }); // 0 이 되지 않음
  assert.deepEqual(fitWithin(2000, 2000, 500), { width: 500, height: 500, scaled: true });
  assert.equal(MAX_SIDE, 1600);
});

test('needsShrink: GIF 는 그대로, 1MB 넘거나 긴 변 1600px 넘으면 다시 만든다', () => {
  assert.equal(needsShrink({ type: 'image/gif', bytes: 9 * MB, width: 4000, height: 3000 }), false);
  assert.equal(needsShrink({ type: 'image/jpeg', bytes: 5 * MB, width: 4000, height: 3000 }), true);
  assert.equal(needsShrink({ type: 'image/jpeg', bytes: 1.5 * MB, width: 1200, height: 900 }), true);
  assert.equal(needsShrink({ type: 'image/png', bytes: 300 * 1024, width: 2400, height: 300 }), true);
  assert.equal(needsShrink({ type: 'image/png', bytes: 300 * 1024, width: 1600, height: 1200 }), false);
  assert.equal(needsShrink({ type: 'image/webp', bytes: SHRINK_OVER_BYTES, width: 100, height: 100 }), false); // 딱 1MB 는 그대로
});

test('pickOutputType: 투명 + 작은 PNG 만 PNG, 나머지는 JPEG', () => {
  assert.equal(pickOutputType({ hasAlpha: true, pngBytes: 400 * 1024 }), 'image/png');
  assert.equal(pickOutputType({ hasAlpha: true, pngBytes: KEEP_PNG_MAX_BYTES + 1 }), 'image/jpeg');
  assert.equal(pickOutputType({ hasAlpha: false, pngBytes: 10 }), 'image/jpeg');
  assert.equal(pickOutputType({ hasAlpha: true, pngBytes: 0 }), 'image/jpeg');
});

test('keepOriginal: 줄이지 않았는데 더 커졌으면 원본, 크기를 줄였으면 늘 새것', () => {
  assert.equal(keepOriginal({ originalBytes: 1.2 * MB, resultBytes: 1.3 * MB, scaled: false }), true);
  assert.equal(keepOriginal({ originalBytes: 1.2 * MB, resultBytes: 0.4 * MB, scaled: false }), false);
  assert.equal(keepOriginal({ originalBytes: 0.5 * MB, resultBytes: 0.6 * MB, scaled: true }), false);
});

test('버킷 한도와 맞춤: 종류·크기(마이그레이션 0400 그대로)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261023000400_qm_storage.sql', import.meta.url), 'utf8');
  assert.match(sql, /'question-images', 'question-images', true, 10485760/);
  for (const t of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) assert.ok(sql.includes(`'${t}'`), t);
  // 다시 만든 결과 종류(JPEG·PNG)는 버킷이 받는 종류다
  assert.ok(['image/jpeg', 'image/png'].every((t) => sql.includes(`'${t}'`)));
  // 브라우저에서 풀 원본 한도는 버킷 한도보다 크다(줄인 뒤 10MB 아래면 올라감)
  assert.ok(MAX_INPUT_BYTES > 10485760);
  const src = readFileSync(new URL('../../src/api/image.js', import.meta.url), 'utf8');
  assert.match(src, /const MAX_BYTES = 10 \* 1024 \* 1024;/);
});
