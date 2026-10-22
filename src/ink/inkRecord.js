// 저장 값(문항 하나의 필기 기록) 다루기 — 순수 함수(IndexedDB·DOM 없음). inkDb·inkBackup 이 쓰고, Node 시험이 바로 부른다.
//  보관(예전 필기): 문항 글이 바뀐 뒤(지문 다름) 새 필기가 예전 필기를 대신하게 될 때, 예전 기록을 지우지 않고
//                   "<열쇠>#old:<예전 지문>:<마지막으로 쓴 때>" 열쇠에 옮겨 둔다(같은 기록을 두 번 보관해도 열쇠가 같아 하나).
//                   문항마다 ARCHIVE_KEEP 개를 넘는 것 가운데 ARCHIVE_MAX_AGE_MS 보다 오래된 것만 정리한다.
//  백업 파일: { app, version, exportedAt, username, items: [{ key, value }] } — value 는 판 1 모양(pts 중첩 배열, JSON 그대로)
import { packRecord, portableRecord, unpackRecord } from "./geometry.js";

export const ARCHIVE_TAG = "#old:";
export const ARCHIVE_KEEP = 3;
export const ARCHIVE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export const BACKUP_APP = "quiz-maker-ink";
export const BACKUP_VERSION = 1;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// 저장 값의 가장 최근에 쓴 때(폭마다의 updatedAt 중 가장 큰 값)
export function recordUpdatedAt(raw) {
  if (!isObj(raw) || !isObj(raw.layouts)) return 0;
  let at = 0;
  for (const l of Object.values(raw.layouts)) at = Math.max(at, numOr(l?.updatedAt, 0));
  return at;
}

export function rawHasStrokes(raw) {
  return isObj(raw) && isObj(raw.layouts) && Object.values(raw.layouts).some((l) => Array.isArray(l?.strokes) && l.strokes.length > 0);
}

export function isArchiveKey(key) {
  return typeof key === "string" && key.includes(ARCHIVE_TAG);
}

// 열쇠 key 의 보관 열쇠들이 들어가는 범위의 앞부분
export function archivePrefix(key) {
  return `${key}${ARCHIVE_TAG}`;
}

export function archiveKeyOf(key, raw) {
  return `${archivePrefix(key)}${raw.textHash}:${recordUpdatedAt(raw)}`;
}

// 저장소에 있던 기록(existing)을 새 기록(next)으로 바꾸기 전에 보관해야 하나: 예전 필기가 있고 지문이 다를 때.
// next 가 null(지우기)이면 보관하지 않는다 — '지우기'는 사용자가 확인하고 고른 것
export function needsArchive(existing, next) {
  return rawHasStrokes(existing) && isObj(next) && typeof existing.textHash === "string" && existing.textHash !== next.textHash;
}

export function archiveValue(existing, key, now) {
  return { ...existing, archivedAt: now, sourceKey: key };
}

// 같은 문항의 보관 기록들 [{ key, value }] 가운데 가장 최근에 보관한 것(archivedAt, 같으면 마지막으로 쓴 때) — '예전 필기 흐리게 보기'.
// 보관 열쇠가 아니거나 선이 없는 것은 건너뛴다. 없으면 null
export function latestArchive(list) {
  let best = null;
  let bestAt = -Infinity;
  let bestUpd = -Infinity;
  for (const it of list || []) {
    if (!isObj(it) || !isArchiveKey(it.key) || !rawHasStrokes(it.value)) continue;
    const at = numOr(it.value.archivedAt, 0);
    const upd = recordUpdatedAt(it.value);
    if (at > bestAt || (at === bestAt && upd > bestUpd)) {
      best = it;
      bestAt = at;
      bestUpd = upd;
    }
  }
  return best;
}

// 정리할 보관 열쇠들. list = [{ key, archivedAt }]. 최근 것부터 keep 개는 남기고, 그 밖의 것 중 maxAge 보다 오래된 것만
export function archivesToPrune(list, now, keep = ARCHIVE_KEEP, maxAge = ARCHIVE_MAX_AGE_MS) {
  const sorted = [...list].sort((a, b) => numOr(b.archivedAt, 0) - numOr(a.archivedAt, 0));
  return sorted.slice(keep).filter((a) => now - numOr(a.archivedAt, 0) > maxAge).map((a) => a.key);
}

// ── 백업 파일 ──
let tmpId = 0;
const nextTmpId = () => ++tmpId;

// 저장 값(판 1·2) → 백업에 넣을 모양(판 1). 선이 하나도 없으면 null. 보관 기록은 archivedAt·sourceKey 도 옮긴다
export function portableValue(raw) {
  const rec = unpackRecord(raw, nextTmpId);
  const out = portableRecord(rec);
  if (!out) return null;
  if (numOr(raw.archivedAt, null) != null) out.archivedAt = raw.archivedAt;
  if (typeof raw.sourceKey === "string") out.sourceKey = raw.sourceKey;
  return out;
}

// 백업 값(판 1) → 저장 값(판 2). 모양이 틀리거나 선이 없으면 null
export function storableValue(raw) {
  const rec = unpackRecord(raw, nextTmpId);
  const out = packRecord(rec);
  if (!out) return null;
  if (numOr(raw.archivedAt, null) != null) out.archivedAt = raw.archivedAt;
  if (typeof raw.sourceKey === "string") out.sourceKey = raw.sourceKey;
  return out;
}

// entries = [{ key, value }](이 기기의 저장소에서 읽은 것) → 백업 파일 객체
export function buildBackup(username, entries, now = new Date()) {
  const items = [];
  for (const { key, value } of entries) {
    if (typeof key !== "string" || !key.startsWith(`${username}:`)) continue;
    const v = portableValue(value);
    if (v) items.push({ key, value: v });
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), username, items };
}

// 백업 파일 모양 검사. 맞으면 { ok: true, username, items(쓸 수 있는 것만), bad(버린 수) }, 틀리면 { ok: false, error }
export function validateBackup(obj) {
  if (!isObj(obj)) return { ok: false, error: "필기 백업 파일이 아닙니다." };
  if (obj.app !== BACKUP_APP) return { ok: false, error: "quiz-maker 필기 백업 파일이 아닙니다." };
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: `지원하지 않는 백업 판입니다(${String(obj.version)}).` };
  if (typeof obj.username !== "string") return { ok: false, error: "백업 파일에 아이디가 없습니다." };
  if (!Array.isArray(obj.items)) return { ok: false, error: "백업 파일에 필기 목록이 없습니다." };
  const prefix = `${obj.username}:`;
  const items = [];
  let bad = 0;
  for (const it of obj.items) {
    const value = isObj(it) && typeof it.key === "string" && it.key.length > prefix.length && it.key.startsWith(prefix)
      ? storableValue(it.value) : null;
    if (value) items.push({ key: it.key, value });
    else bad += 1;
  }
  return { ok: true, username: obj.username, items, bad };
}

// 같은 지문의 두 기록 합치기: 폭마다 더 최근에 쓴 쪽. 들어온 쪽(incoming)에서 가져온 폭이 있으면 changed
function mergeLayouts(existing, incoming) {
  const layouts = { ...existing.layouts };
  let changed = false;
  for (const [w, l] of Object.entries(incoming.layouts)) {
    const cur = layouts[w];
    if (!cur || !Array.isArray(cur.strokes) || !cur.strokes.length || numOr(l.updatedAt, 0) > numOr(cur.updatedAt, 0)) {
      layouts[w] = l;
      changed = true;
    }
  }
  return { record: { ...existing, layouts }, changed };
}

// 가져오기 계획(순수). checked = validateBackup 결과(ok), username = 지금 아이디(열쇠 앞부분을 이 아이디로 바꿔 넣는다),
// existing = Map(열쇠 → 이 기기에 있는 저장 값). overwrite 가 아니면 이 기기의 더 새 기록을 덮어쓰지 않는다.
// 돌려주는 값: { writes: [{ key, value }], imported, skipped }. 지문이 다른 기록을 바꿔 넣을 때는 이 기기의 기록을 먼저 보관(writes 에 함께)
export function planImport(checked, username, existing, { overwrite = false, now = Date.now() } = {}) {
  const writes = [];
  let imported = 0;
  let skipped = checked.bad || 0;
  const from = `${checked.username}:`;
  const seen = new Set();
  for (const { key, value } of checked.items) {
    const k = `${username}:${key.slice(from.length)}`;
    if (seen.has(k)) {
      skipped += 1;
      continue;
    }
    seen.add(k);
    const cur = existing.get(k);
    if (isArchiveKey(k)) {
      if (cur && !overwrite) skipped += 1;
      else {
        writes.push({ key: k, value });
        imported += 1;
      }
      continue;
    }
    if (!rawHasStrokes(cur)) {
      writes.push({ key: k, value });
      imported += 1;
      continue;
    }
    if (cur.textHash === value.textHash && !overwrite) {
      const m = mergeLayouts(cur, value);
      if (m.changed) {
        writes.push({ key: k, value: m.record });
        imported += 1;
      } else skipped += 1;
      continue;
    }
    if (overwrite || recordUpdatedAt(value) > recordUpdatedAt(cur)) {
      if (cur.textHash !== value.textHash) writes.push({ key: archiveKeyOf(k, cur), value: archiveValue(cur, k, now) });
      writes.push({ key: k, value });
      imported += 1;
    } else skipped += 1;
  }
  return { writes, imported, skipped };
}
