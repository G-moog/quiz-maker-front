import { call } from "./client";

// 질문 메모 API (내 계정에 저장). 오류는 화면에 그대로 보여 줄 수 있는 한국어 문장으로 온다(api/supabase.js).
export const NOTES_NOT_READY_MESSAGE = "질문 메모 기능이 아직 서버에 준비되지 않았습니다.";

// DB 에 메모 함수가 아직 없으면(스키마 적용 전, PGRST202) 메모 화면에 맞는 문장으로
function friendlyError(e) {
  if (!e || !e.notReady) return e;
  const out = new Error(NOTES_NOT_READY_MESSAGE);
  out.notReady = true;
  out.status = e.status;
  out.code = e.code;
  return out;
}

async function run(fn, args, expect) {
  try {
    return await call(fn, args, { expect });
  } catch (e) {
    throw friendlyError(e);
  }
}

// status: "open" | "resolved" | "all"(기본), setId: 그 문제집 메모만
export function listNotes({ status = "all", setId } = {}) {
  return run("qm_list_notes", { p_status: status, p_set_id: setId ?? null }, "array");
}

// body: { setId?, questionId?, blankNo?, context?, content }
export function createNote(body) {
  return run("qm_create_note", { p_note: body }, "object");
}

// body: { content?, resolved? }
export function updateNote(id, body) {
  return run(
    "qm_update_note",
    { p_note_id: id, p_content: body?.content ?? null, p_resolved: body?.resolved ?? null },
    "object"
  );
}

export function deleteNote(id) {
  return run("qm_delete_note", { p_note_id: id }, "object");
}
