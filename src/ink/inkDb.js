// 필기 저장: 이 기기의 IndexedDB(db 'qm-ink', 저장소 'ink'). 열쇠 = "<로그인 아이디>:<문제집 id>:<문항 id>"
// (문항 글이 바뀌어 대신 들어간 예전 필기는 "<열쇠>#old:…" 에 보관 — inkRecord.js)
// 서버에는 올리지 않는다. 열지 못하면(사생활 보호 창 일부·저장 공간 부족) 약속(Promise)이 거절되고,
// 부르는 쪽(inkStore)은 작은 경고만 보인다.
// 저장·읽기는 부른 순서대로 한 줄로 처리한다(앞 저장이 다시 열기로 늦어져도 뒤 저장을 덮어쓰지 않게, 저장 직후 읽으면 저장한 값이 보이게).
import { archiveKeyOf, archivePrefix, archiveValue, archivesToPrune, needsArchive } from "./inkRecord.js";

const DB_NAME = "qm-ink";
const STORE = "ink";

let opening = null;

function openDb() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // 다른 탭이 판을 올리거나 브라우저가 연결을 닫으면 다음 요청 때 다시 연다
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      db.onclose = () => {
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

// 거래 하나: body(store, out) 가 요청을 넣고(성공 처리기 안에서 요청을 더 넣어도 같은 거래), 끝나면 out.result 로 풀린다
function tx(mode, body) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = {};
    body(t.objectStore(STORE), out);
    t.oncomplete = () => resolve(out.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("IndexedDB abort"));
  }));
}

// 닫힌 연결 등으로 한 번 실패하면 다시 열어 한 번 더
function retry(mode, body) {
  return tx(mode, body).catch(() => {
    opening = null;
    return tx(mode, body);
  });
}

// 한 줄로 세우기
let chain = Promise.resolve();
function queued(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

const rangeOf = (prefix) => IDBKeyRange.bound(prefix, `${prefix}￿`);

// 이 기기의 필기를 '지속 저장소'로 해 달라고 한 번만 부탁한다(저장 공간이 모자랄 때 브라우저가 지우지 않게).
// 홈 화면에 설치한 앱은 대개 바로 허락된다. 못 하는 브라우저·거절은 그냥 넘어간다
// 부탁했으면(이미 지속이면 부탁하지 않음) true 로 풀린다. 못 하는 브라우저는 false
export function askPersist(nav) {
  try {
    const st = nav?.storage;
    if (!st || typeof st.persist !== "function") return Promise.resolve(false);
    const already = typeof st.persisted === "function" ? st.persisted() : false;
    return Promise.resolve(already)
      .then((yes) => (yes ? false : Promise.resolve(st.persist()).then(() => true)))
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

let persistAsked = false;
export function requestPersistOnce() {
  if (persistAsked) return;
  persistAsked = true;
  askPersist(typeof navigator === "undefined" ? undefined : navigator);
}

export function loadInk(key) {
  return queued(() => retry("readonly", (st, out) => {
    const req = st.get(key);
    req.onsuccess = () => { out.result = req.result ?? null; };
  }));
}

// value 가 null 이면 지운다. archiveStale: 저장소의 기록이 다른 지문(문항 글이 바뀌기 전)의 필기이면
// 같은 거래 안에서 먼저 보관하고(정리 규칙에 맞는 오래된 보관은 지움) 바꾼다 — 보관 없이 바뀌는 일이 없게.
// 풀리는 값: { archived: 보관했나 }
export function saveInk(key, value, { archiveStale = false } = {}) {
  const p = queued(() => retry("readwrite", (st, out) => {
    out.result = { archived: false };
    const write = () => {
      if (value) st.put(value, key);
      else st.delete(key);
    };
    if (!archiveStale || !value) {
      write();
      return;
    }
    const get = st.get(key);
    get.onsuccess = () => {
      const existing = get.result;
      if (!needsArchive(existing, value)) {
        write();
        return;
      }
      const now = Date.now();
      st.put(archiveValue(existing, key, now), archiveKeyOf(key, existing));
      out.result = { archived: true };
      write();
      // 같은 문항의 보관이 많으면 오래된 것 정리(규칙: inkRecord.archivesToPrune)
      const range = rangeOf(archivePrefix(key));
      const keysReq = st.getAllKeys(range);
      keysReq.onsuccess = () => {
        const keys = keysReq.result;
        const valsReq = st.getAll(range);
        valsReq.onsuccess = () => {
          const list = keys.map((k, i) => ({ key: k, archivedAt: valsReq.result[i]?.archivedAt ?? 0 }));
          for (const k of archivesToPrune(list, now)) st.delete(k);
        };
      };
    };
  }));
  if (value) p.then(() => requestPersistOnce(), () => {});
  return p;
}

// 열쇠가 prefix 로 시작하는 기록 모두 [{ key, value }] (백업 내보내기·가져오기)
export function listInk(prefix) {
  return queued(() => retry("readonly", (st, out) => {
    const range = rangeOf(prefix);
    const keysReq = st.getAllKeys(range);
    keysReq.onsuccess = () => {
      const valsReq = st.getAll(range);
      valsReq.onsuccess = () => {
        out.result = keysReq.result.map((key, i) => ({ key, value: valsReq.result[i] }));
      };
    };
  }));
}

// 여러 기록을 한 거래로 쓰기(가져오기). 하나라도 실패하면 모두 쓰지 않는다
export function putManyInk(entries) {
  return queued(() => retry("readwrite", (st, out) => {
    for (const { key, value } of entries) st.put(value, key);
    out.result = entries.length;
  }));
}
