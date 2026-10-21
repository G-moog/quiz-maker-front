// 마이그레이션 해시 잠금(설계서 7.2절 3번).
//   node test/db/lock.mjs        지금 파일 해시와 migrations.lock.json 을 견줘 보여 준다(읽기만)
//   node test/db/lock.mjs --add  lock 에 없는 새 파일만 더한다(이미 있는 줄은 절대 바꾸지 않음)
// 적용된 파일의 내용이 바뀌었으면 고치지 말고 새 파일로 내야 한다. 운영에 아직 적용되지 않은 파일을
// 고쳐야 할 때만 lock 의 그 줄을 손으로 지우고 --add 로 다시 더한다(supabase/README.md).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LOCK_FILE, migrationFiles, readMigration, lockHash } from './harness.mjs';

const add = process.argv.includes('--add');
const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : { files: {} };
let changed = false;
let bad = 0;

for (const f of migrationFiles()) {
  const h = lockHash(readMigration(f));
  if (!(f in lock.files)) {
    if (add) {
      lock.files[f] = h;
      changed = true;
      console.log(`더함    ${f}  ${h}`);
    } else {
      console.log(`lock 없음 ${f}  ${h}  (--add 로 더하기)`);
      bad++;
    }
  } else if (lock.files[f] !== h) {
    console.log(`바뀜!   ${f}  lock ${lock.files[f]}  지금 ${h}`);
    bad++;
  } else {
    console.log(`같음    ${f}`);
  }
}
for (const f of Object.keys(lock.files)) {
  if (!migrationFiles().includes(f)) {
    console.log(`사라짐! ${f} (적용된 파일은 지우거나 이름을 바꾸지 않는다)`);
    bad++;
  }
}

if (changed) {
  const sorted = Object.fromEntries(Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(LOCK_FILE, JSON.stringify({ ...lock, files: sorted }, null, 2).replace(/\n/g, '\r\n') + '\r\n');
}
process.exitCode = bad ? 1 : 0;
