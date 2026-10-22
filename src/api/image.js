import { connectionError, currentUserId, getSupabase, sessionExpiredError, signOutLocal } from "./supabase";
import {
  JPEG_QUALITY, MAX_INPUT_BYTES, fitWithin, keepOriginal, needsShrink, pickOutputType,
} from "../utils/imageSize";

// 문항 그림 올리기: Supabase Storage 의 공개 버킷 question-images 에, 내 uid 폴더 아래 새 이름으로(설계서 2.6·4.1절).
// 옛 그림(Cloudinary 주소)은 문항에 적힌 주소 그대로 <img> 로 보인다 — 옮기지 않는다.
// 올리기 전에 브라우저에서 줄인다(긴 변 1600px·JPEG 0.85, 투명하고 작은 그림은 PNG, GIF 는 그대로 — utils/imageSize.js).
// 버킷이 받는 종류(jpg·png·gif·webp)·크기(10MB)는 supabase/migrations/…0400_qm_storage.sql 과 같게.
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

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// 그림을 풀어 비트맵으로(사진의 회전 정보 반영). 못 풀면 null — 그때는 원본을 그대로 올린다
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try { return await createImageBitmap(file); } catch { /* 아래 <img> 로 */ }
    }
  }
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); }
  });
}

// 투명한 곳(알파 < 255)이 하나라도 있는지
function hasTransparency(ctx, width, height) {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
    return false;
  } catch {
    return true; // 모르면 투명하다고 보고 PNG 를 먼저 해 본다
  }
}

// 올릴 몸과 종류를 정한다: 줄일 필요가 없거나 못 줄이면 원본 그대로
async function prepareImage(file, type) {
  if (type === "image/gif") return { body: file, type };
  const img = await decodeImage(file);
  if (!img) return { body: file, type };
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  try {
    if (!needsShrink({ type, bytes: file.size, width, height })) return { body: file, type };
    const target = fitWithin(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { body: file, type };
    ctx.imageSmoothingQuality = "high";
    let out = null;
    if (type === "image/png" || type === "image/webp") {
      ctx.drawImage(img, 0, 0, target.width, target.height);
      if (hasTransparency(ctx, target.width, target.height)) {
        const png = await canvasBlob(canvas, "image/png");
        if (png && pickOutputType({ hasAlpha: true, pngBytes: png.size }) === "image/png") out = { body: png, type: "image/png" };
      }
    }
    if (!out) {
      // JPEG 는 투명한 곳이 검게 되므로 흰 바탕 위에 그린다
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, target.width, target.height);
      ctx.drawImage(img, 0, 0, target.width, target.height);
      const jpg = await canvasBlob(canvas, "image/jpeg", JPEG_QUALITY);
      if (!jpg) return { body: file, type };
      out = { body: jpg, type: "image/jpeg" };
    }
    if (keepOriginal({ originalBytes: file.size, resultBytes: out.body.size, scaled: target.scaled })) return { body: file, type };
    return out;
  } finally {
    img.close?.();
  }
}

export async function uploadImage(file) {
  if (!file) throw new Error("올릴 그림을 골라 주세요.");
  const type = imageType(file);
  if (!type) throw new Error("jpg·png·gif·webp 그림만 올릴 수 있습니다.");
  // GIF 는 줄이지 않으므로 버킷 한도로, 그 밖에는 브라우저가 풀어 줄일 수 있는 크기까지 받는다
  const inputMax = type === "image/gif" ? MAX_BYTES : MAX_INPUT_BYTES;
  if (file.size > inputMax) {
    throw new Error(`그림은 ${type === "image/gif" ? "10MB" : "30MB"} 까지 올릴 수 있습니다(지금 ${mb(file.size)}).`);
  }
  const prepared = await prepareImage(file, type);
  const outType = prepared.type;
  // 종류가 비어 온 파일도 맞는 종류로 올린다(버킷이 종류를 검사함)
  const body = prepared.body === file && file.type !== type ? new Blob([file], { type }) : prepared.body;
  if (body.size > MAX_BYTES) {
    throw new Error(`그림을 10MB 아래로 줄이지 못했습니다(지금 ${mb(body.size)}). 더 작은 그림을 골라 주세요.`);
  }
  const uid = await currentUserId();
  const path = `${uid}/${today()}-${newId()}.${EXT_OF_TYPE[outType]}`;
  const bucket = getSupabase().storage.from(BUCKET);
  // upsert:false — 버킷 정책은 '새로 넣기'만 허용한다(덮어쓰기·지우기 없음)
  const { error } = await bucket.upload(path, body, { upsert: false, contentType: outType, cacheControl: "31536000" });
  if (error) throw await storageError(error);
  return { url: bucket.getPublicUrl(path).data.publicUrl };
}
