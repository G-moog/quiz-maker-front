import { connectionError, currentUserId, getSupabase, sessionExpiredError, signOutLocal } from "./supabase";

// 문항 그림 올리기: Supabase Storage 의 공개 버킷 question-images 에, 내 uid 폴더 아래 새 이름으로(설계서 2.6·4.1절).
// 옛 그림(Cloudinary 주소)은 문항에 적힌 주소 그대로 <img> 로 보인다 — 옮기지 않는다.
// 반환: { url } (옛 /api/images/upload 와 같은 꼴)

const BUCKET = "question-images";
const MAX_BYTES = 10 * 1024 * 1024; // 버킷 한도와 같게(10 MB)
const EXT_OF_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const TYPE_OF_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
export const IMAGE_ACCEPT = Object.keys(EXT_OF_TYPE).join(",");

// 파일 종류: 브라우저가 알려 준 종류, 없으면(일부 휴대폰) 확장자로
function imageType(file) {
  if (EXT_OF_TYPE[file.type]) return file.type;
  if (file.type) return null;
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  return TYPE_OF_EXT[ext] || null;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function storageError(error) {
  const status = Number(error?.status) || 0;
  const statusCode = String(error?.statusCode ?? "");
  const msg = String(error?.message || "");
  if (error?.name === "StorageUnknownError" || (!status && !statusCode)) return connectionError(0);
  if (status === 540) return connectionError(540);
  if (status === 401 || statusCode === "401" || /jwt|token/i.test(msg)) {
    await signOutLocal({ expired: true });
    return sessionExpiredError();
  }
  let message;
  if (statusCode === "413" || status === 413) message = "그림은 10MB 까지 올릴 수 있습니다.";
  else if (statusCode === "415" || status === 415 || /mime/i.test(msg)) message = "jpg·png·gif·webp 그림만 올릴 수 있습니다.";
  else if (statusCode === "403" || status === 403) message = "그림을 올릴 권한이 없습니다(계정 준비가 끝났는지 확인해 주세요).";
  else if (statusCode === "409" || status === 409) message = "같은 이름의 그림이 이미 있습니다. 다시 올려 주세요.";
  else if (status >= 500) message = `서버 오류로 그림을 올리지 못했습니다(HTTP ${status}). 잠시 뒤 다시 해 주세요.`;
  else message = `그림을 올리지 못했습니다(${msg || `HTTP ${status}`}).`;
  const err = new Error(message);
  err.status = status || undefined;
  err.code = statusCode || undefined;
  return err;
}

export async function uploadImage(file) {
  if (!file) throw new Error("올릴 그림을 골라 주세요.");
  const type = imageType(file);
  if (!type) throw new Error("jpg·png·gif·webp 그림만 올릴 수 있습니다.");
  if (file.size > MAX_BYTES) {
    throw new Error(`그림은 10MB 까지 올릴 수 있습니다(지금 ${(file.size / 1024 / 1024).toFixed(1)}MB).`);
  }
  const uid = await currentUserId();
  const path = `${uid}/${today()}-${newId()}.${EXT_OF_TYPE[type]}`;
  // 종류가 비어 온 파일도 맞는 종류로 올린다(버킷이 종류를 검사함)
  const body = file.type === type ? file : new Blob([file], { type });
  const bucket = getSupabase().storage.from(BUCKET);
  // upsert:false — 버킷 정책은 '새로 넣기'만 허용한다(덮어쓰기·지우기 없음)
  const { error } = await bucket.upload(path, body, { upsert: false, contentType: type, cacheControl: "31536000" });
  if (error) throw await storageError(error);
  return { url: bucket.getPublicUrl(path).data.publicUrl };
}
