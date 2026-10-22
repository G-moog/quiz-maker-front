// 필기 백업(JSON): 이 기기·이 주소(origin)에만 있는 필기를 파일로 내보내고 다시 들여온다.
// 대시보드 메뉴가 부른다(파일 저장·고르기는 부르는 쪽). 모양·합치기 규칙은 inkRecord.js(순수 함수, 시험 있음)
//  exportInkJson(username) → { app: "quiz-maker-ink", version: 1, exportedAt, username, items: [{ key, value }] }
//    이 아이디의 모든 문항 필기와 보관한 예전 필기. value 는 JSON 그대로 옮길 수 있는 모양
//  importInkJson(obj, username, { overwrite }) → { imported, skipped }
//    모양이 틀리면 Error(문구는 한국어). 열쇠의 아이디 부분은 지금 아이디로 바꿔 넣는다(아이디가 바뀐 뒤에도 들여오게).
//    이 기기의 더 새 기록은 덮어쓰지 않는다(overwrite: true 면 덮어씀 — 지문이 다르면 이 기기 것을 먼저 보관)
import { listInk, putManyInk } from "./inkDb.js";
import { buildBackup, planImport, validateBackup } from "./inkRecord.js";

export async function exportInkJson(username) {
  const user = String(username ?? "");
  const entries = await listInk(`${user}:`);
  return buildBackup(user, entries);
}

export async function importInkJson(obj, username, { overwrite = false } = {}) {
  const checked = validateBackup(obj);
  if (!checked.ok) throw new Error(checked.error);
  const user = String(username ?? "");
  const existing = new Map((await listInk(`${user}:`)).map(({ key, value }) => [key, value]));
  const plan = planImport(checked, user, existing, { overwrite });
  if (plan.writes.length) await putManyInk(plan.writes);
  return { imported: plan.imported, skipped: plan.skipped };
}
