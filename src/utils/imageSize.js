// 그림 올리기 전 줄이기의 셈(화면 없이 값만 — Node 시험에서 그대로 부른다). 실제로 줄이는 일은 api/image.js 가 한다.
// 휴대폰 사진(3~8MB, 4000px 안팎)을 그대로 올리면 Storage(Free 1GB)·데이터를 빨리 쓰고 문항이 늦게 뜬다.
// 긴 변 1600px · JPEG 품질 0.85 면 보통 200~500KB 다.
export const MAX_SIDE = 1600; // 긴 변 한도(px)
export const SHRINK_OVER_BYTES = 1024 * 1024; // 이보다 크면 크기가 한도 안이어도 다시 만든다(1MB)
export const JPEG_QUALITY = 0.85;
export const KEEP_PNG_MAX_BYTES = 1024 * 1024; // 투명한 그림은 PNG 로 다시 만든 것이 이보다 작을 때만 PNG 로 둔다
export const MAX_INPUT_BYTES = 30 * 1024 * 1024; // 브라우저에서 풀어 줄이기에도 너무 큰 파일(휴대폰이 버거움)

// 긴 변을 max 안으로(비율 그대로, 늘리지는 않음). 한 변이 0 이 되지 않게 1 이상
export function fitWithin(width, height, max = MAX_SIDE) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const long = Math.max(w, h);
  if (long <= max) return { width: w, height: h, scaled: false };
  const k = max / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

// 다시 만들지: GIF 는 움직이는 그림일 수 있어 그대로. 그 밖에는 1MB 를 넘거나 긴 변이 1600px 를 넘을 때
export function needsShrink({ type, bytes, width, height }) {
  if (type === "image/gif") return false;
  return Number(bytes) > SHRINK_OVER_BYTES || Math.max(Number(width) || 0, Number(height) || 0) > MAX_SIDE;
}

// 다시 만들 종류: 투명한 곳이 있고 PNG 로 만든 것이 작으면 PNG(투명 유지), 아니면 JPEG(투명한 곳은 흰 바탕)
export function pickOutputType({ hasAlpha, pngBytes }) {
  return hasAlpha && Number(pngBytes) > 0 && Number(pngBytes) <= KEEP_PNG_MAX_BYTES ? "image/png" : "image/jpeg";
}

// 다시 만든 것이 원본보다 크거나 같고, 원본이 이미 크기 한도 안이면 원본을 올린다(이미 잘 줄인 JPEG 등)
export function keepOriginal({ originalBytes, resultBytes, scaled }) {
  return !scaled && Number(resultBytes) >= Number(originalBytes);
}
