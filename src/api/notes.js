import { authFetch } from "./client";
import { SESSION_EXPIRED_MESSAGE } from "../utils/session";

// 질문 메모 API (내 계정에 저장). 오류는 화면에 그대로 보여 줄 수 있는 한국어 문장으로 바꿔 던진다.
export const NOTES_NOT_READY_MESSAGE = "질문 메모 기능이 아직 서버에 준비되지 않았습니다.";

// 서버가 아직 /api/notes 를 모르면(백엔드 배포 전) 404·405, 또는 오류 화면 요청이 막혀 403 이 빈 몸으로 온다.
// 서버가 직접 쓴 안내 글(평문)이 오면 그 글을 그대로 쓴다.
function friendlyError(e) {
  if (!e || e.message === SESSION_EXPIRED_MESSAGE) return e;
  const raw = (e.message || "").trim();
  const generic = !raw || /^HTTP \d+$/.test(raw) || raw.startsWith("{") || raw.startsWith("<");
  let out;
  if ([403, 404, 405].includes(e.status) && generic) {
    out = new Error(NOTES_NOT_READY_MESSAGE);
    out.notReady = true;
  } else if (e instanceof TypeError) {
    out = new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  } else if (e.status >= 500) {
    out = new Error(`서버 오류로 처리하지 못했습니다(HTTP ${e.status}). 잠시 뒤 다시 해 주세요.`);
  } else if (raw.startsWith("{")) {
    let msg = "";
    try {
      const j = JSON.parse(raw);
      msg = j.message || j.error || "";
    } catch {
      // 읽을 수 없는 몸이면 아래 기본 문장
    }
    out = new Error(msg || `요청을 처리하지 못했습니다(HTTP ${e.status ?? "?"}).`);
  } else {
    return e;
  }
  out.status = e.status;
  return out;
}

async function call(path, options) {
  try {
    return await authFetch(path, options);
  } catch (e) {
    throw friendlyError(e);
  }
}

// status: "open" | "resolved" | "all"(기본), setId: 그 문제집 메모만
export function listNotes({ status = "all", setId } = {}) {
  const p = new URLSearchParams({ status });
  if (setId != null) p.set("setId", String(setId));
  return call(`/api/notes?${p.toString()}`);
}

// body: { setId?, questionId?, blankNo?, context?, content }
export function createNote(body) {
  return call("/api/notes", { method: "POST", body: JSON.stringify(body) });
}

// body: { content?, resolved? }
export function updateNote(id, body) {
  return call(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteNote(id) {
  return call(`/api/notes/${id}`, { method: "DELETE" });
}
