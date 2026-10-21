// 엑셀 내려받기·올리기 — 옛 서버(Apache POI)가 하던 일이라 새 구조에는 아직 없다.
// 결정 4(엑셀)가 미정이어서 단추는 src/config.js 의 SHOW_EXCEL(기본 false)로 숨겨 두었다.
// 쓰기로 정하면 이 파일을 브라우저 엑셀(SheetJS 를 단추를 누를 때 불러옴, 설계서 1.5·5.1절)로 다시 쓰고
// 여러 문항 넣기 DB 함수(qm_add_questions·qm_create_set_with_questions)를 새 마이그레이션으로 더한다.
// 그때까지 이 함수들은 이름만 남기고 '준비 안 됨' 오류를 낸다(화면 코드를 바꾸지 않으려고).

export const EXCEL_NOT_READY_MESSAGE = "엑셀 기능은 새 서버에서 아직 준비되지 않았습니다.";

function notReady() {
  const err = new Error(EXCEL_NOT_READY_MESSAGE);
  err.notReady = true;
  return err;
}

export function downloadSet() {
  throw notReady();
}

export function downloadAll() {
  throw notReady();
}

export function downloadTemplate() {
  throw notReady();
}

export async function uploadToSet() {
  throw notReady();
}

export async function uploadAsNew() {
  throw notReady();
}
