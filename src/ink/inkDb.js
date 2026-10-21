// 필기 저장: 이 기기의 IndexedDB(db 'qm-ink', 저장소 'ink'). 열쇠 = "<로그인 아이디>:<문제집 id>:<문항 id>"
// 서버에는 올리지 않는다. 열지 못하면(사생활 보호 창 일부·저장 공간 부족) 약속(Promise)이 거절되고,
// 부르는 쪽(inkStore)은 작은 경고만 보인다.
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

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB abort"));
  }));
}

// 닫힌 연결 등으로 한 번 실패하면 다시 열어 한 번 더
function retry(mode, fn) {
  return run(mode, fn).catch(() => {
    opening = null;
    return run(mode, fn);
  });
}

export function loadInk(key) {
  return retry("readonly", (st) => st.get(key)).then((v) => v ?? null);
}

// value 가 null 이면 지운다
export function saveInk(key, value) {
  return retry("readwrite", (st) => (value ? st.put(value, key) : st.delete(key)));
}
