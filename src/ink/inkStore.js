import { loadInk as dbLoadInk, loadLatestArchive as dbLoadArchive, saveInk as dbSaveInk } from "./inkDb.js";
import { driftExceeds, matchWidth, packRecord, unpackRecord } from "./geometry.js";
import { loadInkTool, saveInkTool } from "./inkMode.js";

// 필기 상태 보관소(React 바깥). 풀기 화면 하나에 하나를 만들고, 필기 영역·도구 막대가 useSyncExternalStore 로 읽는다.
// 선이 늘어도 문항 본문(긴 글)을 다시 그리지 않게 상태를 화면(SolveView) 밖에 둔다.
//  record  : 지금 문항의 필기 { textHash, layouts: { "<영역 폭>": { height, strokes, updatedAt } } } (없으면 null)
//            폭(정수 px)마다 따로 — 가로·세로 화면이 각자 자기 필기를 갖는다. 폭이 WIDTH_TOLERANCE_PX 안으로 다르면
//            같은 필기로 본다(lw: 지금 쓰는 저장 폭 — 불러올 때·폭이 바뀔 때만 정하고, 선을 다 지워도 그대로)
//  history : 이 문항에서 이번에 한 일(되돌리기용), future: 되돌린 일(다시 하기용 — 새로 긋기·지우기를 하면 비움). 문항이 바뀌면 둘 다 비운다
//  unsure  : 이 문항 필기를 불러오지 못함(저장소 오류). 이때 쓴 필기는 저장 직전에 다시 읽어 저장된 필기 위에 얹는다 —
//            그대로 저장하면 보지 못한 예전 필기(다른 폭 포함)를 덮어써 없애므로. 다시 읽지도 못하면 저장하지 않고 경고만
//  archivedKey : 문항 글이 바뀌기 전의 예전 필기를 보관하고 새 필기로 바꾼 문항(안내용)
//  old     : 이 문항에 보관한 예전 필기 가운데 가장 최근 것 { record, at(보관한 때) } (없으면 null — 불러온 뒤 따로 읽음)
//  oldOn   : 예전 필기를 흐리게 겹쳐 보는 중('흐리게 보기' — 읽기만. 지금 필기·되돌리기·저장과 상관없다).
//            보여 줄 것: 본문이 바뀌어 숨긴 지금 기록, 아니면 old(oldRecord)
// 저장은 마지막 변화 SAVE_DELAY 뒤 한 번에. 펜·마우스가 닿아 있는 동안은 미룬다(쓰는 중에 저장으로 선이 늦게 따라오지 않게 —
// 다만 떼기를 놓친 때를 대비해 SAVE_BUSY_MAX_MS 넘게는 미루지 않음). 문항을 옮기거나 화면을 떠날 때는 바로(flush)
export const SAVE_DELAY = 600;
export const SAVE_BUSY_MAX_MS = 10000;
const EMPTY = Object.freeze([]);

let seq = 0;
const newId = () => ++seq; // 선 id: 그은 순서대로 커진다(지운 선을 되돌릴 때 제자리로)

// 본문이 바뀌어(지문 다름) 예전 필기를 숨겨야 하는가
export function isStale(s) {
  return !!s.record && s.record.textHash !== s.textHash;
}

// 예전 필기(읽기만 — '흐리게 보기'): 본문이 바뀌어 숨긴 지금 기록, 아니면 이 문항에 보관한 가장 최근 기록
export function oldRecord(s) {
  if (isStale(s)) return s.record;
  return s.old?.record ?? null;
}

export function hasOld(s) {
  return hasStrokes(oldRecord(s));
}

// 지금 폭에 겹쳐 그릴 예전 필기 { strokes, approx }. 같은 폭(±WIDTH_TOLERANCE_PX)이 없으면 가장 가까운 폭의 것
// (approx — 다른 화면 폭에서 쓴 것이라 자리가 어긋남)
const NO_OLD = Object.freeze({ strokes: Object.freeze([]), approx: false });
export function oldStrokes(s) {
  const rec = oldRecord(s);
  if (!rec || !s.width) return NO_OLD;
  const exact = rec.layouts[matchWidth(rec.layouts, s.width)]?.strokes;
  if (exact?.length) return { strokes: exact, approx: false };
  let best = null;
  let bestD = Infinity;
  for (const [w, l] of Object.entries(rec.layouts)) {
    const d = Math.abs(Number(w) - s.width);
    if (l?.strokes?.length && d < bestD) {
      best = l.strokes;
      bestD = d;
    }
  }
  return best ? { strokes: best, approx: true } : NO_OLD;
}

// 보관한 예전 필기 안내를 필기 모드에서 저절로 띄우는 기간(보관한 뒤). 지나면 안내 없이 둔다(백업에는 그대로)
export const OLD_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;
export function oldNoticeDue(s, now = Date.now()) {
  return !!s.old && !isStale(s) && now - (s.old.at || 0) <= OLD_NOTICE_MS;
}

// 지금 쓰는 저장 폭(정해지지 않았으면 지금 폭)
export function inkWidth(s) {
  return s.lw || s.width;
}

// 지금 화면에 그릴 선(지금 폭의 것). 불러오는 중·폭을 아직 모름·본문이 바뀜이면 없음
export function visibleStrokes(s) {
  if (!s.loaded || !s.width || isStale(s)) return EMPTY;
  return s.record?.layouts[inkWidth(s)]?.strokes ?? EMPTY;
}

// 다른 폭에서 쓴 필기가 있는 폭들(지금 폭에는 없을 때만)
export function otherWidths(s) {
  if (!s.loaded || !s.width || !s.record || isStale(s) || visibleStrokes(s).length) return EMPTY;
  const lw = inkWidth(s);
  return Object.keys(s.record.layouts).map(Number).filter((w) => w !== lw && s.record.layouts[w].strokes.length);
}

// 저장한 때와 영역 높이가 다른가(글자 크기·글꼴이 바뀌어 필기가 어긋날 수 있음 — 문턱 DRIFT_PX)
export function heightDrift(s) {
  const l = visibleStrokes(s).length ? s.record.layouts[inkWidth(s)] : null;
  return !!l && driftExceeds(l.height, s.height);
}

// 되돌리기·다시 하기를 지금 할 수 있나 — 다른 폭(화면을 돌리기 전)의 일은 보이지 않는 필기를 바꾸므로 막는다
const appliesHere = (s, e) => !!e && (e.type === "record" || e.width === inkWidth(s));
export function canUndo(s) {
  return appliesHere(s, s.history[s.history.length - 1]);
}
export function canRedo(s) {
  return appliesHere(s, s.future[s.future.length - 1]);
}

function hasStrokes(rec) {
  return !!rec && Object.values(rec.layouts).some((l) => l.strokes.length);
}

// 불러오지 못한 채 쓴 필기(mine)를 저장소에 있던 필기(stored) 위에 얹는다(보지 못한 필기를 지우지 않게).
// 폭마다 저장된 선 위에 새 선을 더하고 다른 폭은 그대로 둔다. 저장된 필기가 다른 본문(지문 다름)의 것이면
// 평소 '바뀐 본문 위에 새로 쓰기'처럼 새 필기로 바꾸고 예전 것은 prev 로 돌려준다(되돌리기로 살림 — 저장할 때 보관도 됨)
export function mergeOnto(stored, mine, textHash) {
  if (!hasStrokes(stored)) return { record: mine, prev: null };
  if (!hasStrokes(mine)) return { record: stored, prev: null };
  if (stored.textHash !== textHash) return { record: mine, prev: stored };
  const layouts = { ...stored.layouts };
  for (const [w, l] of Object.entries(mine.layouts)) {
    layouts[w] = { ...l, strokes: [...(stored.layouts[w]?.strokes ?? EMPTY), ...l.strokes] };
  }
  return { record: { textHash, layouts }, prev: null };
}

// db: { loadInk, saveInk, loadArchive? } (시험에서 바꿔 끼움), prefs: { load, save } 도구 기억
export function createInkStore({
  db = { loadInk: dbLoadInk, saveInk: dbSaveInk, loadArchive: dbLoadArchive },
  prefs = { load: loadInkTool, save: saveInkTool },
} = {}) {
  const pref = prefs.load();
  let s = {
    key: null, textHash: "", loaded: false, unsure: false, record: null,
    width: 0, height: 0, lw: 0,
    tool: pref.tool, color: pref.color, hidden: false,
    history: [], future: [], saveError: false, archivedKey: null, old: null, oldOn: false,
  };
  const listeners = new Set();
  let timer = 0;
  let pending = null;
  let pendingSince = 0;
  let busy = false;
  let loadSeq = 0;
  let queued = []; // 불러오기가 끝나기 전에 그은 선(끝나면 더한다)

  function emit(patch) {
    s = { ...s, ...patch };
    for (const l of [...listeners]) l();
  }

  // 이 문항에 보관한 예전 필기 가운데 가장 최근 것을 읽어 둔다('흐리게 보기'용 — 저장소에만 있고 지금 필기와 섞이지 않음).
  // 그 사이 문항이 바뀌었으면 버린다. 못 읽으면 없는 것으로
  function loadOld(key, my) {
    if (typeof db.loadArchive !== "function") return;
    db.loadArchive(key).then(
      (it) => {
        if (my !== loadSeq || s.key !== key) return;
        const record = it ? unpackRecord(it.value, newId) : null;
        if (hasStrokes(record)) emit({ old: { record, at: Number(it.value.archivedAt) || 0 } });
      },
      () => {},
    );
  }

  // 저장 하나. 이번 지문의 필기가 다른 지문(문항이 바뀌기 전)의 저장 기록을 대신하면 저장소가 예전 것을 먼저 보관한다
  function save(p) {
    const archiveStale = p.archive && !!p.record && p.record.textHash === p.textHash;
    db.saveInk(p.key, packRecord(p.record), { archiveStale }).then(
      (res) => {
        const patch = {};
        if (s.saveError) patch.saveError = false;
        const archived = !!res?.archived && s.key === p.key;
        if (archived) patch.archivedKey = p.key;
        if (Object.keys(patch).length) emit(patch);
        // 보관한 예전 필기: 바뀐 본문 위에 새로 쓸 때 이미 화면에 들고 있다(addStroke). 없을 때만 저장소에서 읽는다
        if (archived && !s.old) loadOld(p.key, loadSeq);
      },
      () => emit({ saveError: true }),
    );
  }

  function flush() {
    clearTimeout(timer);
    timer = 0;
    const p = pending;
    pending = null;
    if (!p || !p.key) return;
    if (!p.unsure) {
      save(p);
      return;
    }
    // 불러오지 못한 채 쓴 필기: 다시 읽어 저장된 필기 위에 얹은 뒤 저장한다
    db.loadInk(p.key).then(
      (raw) => {
        const stored = unpackRecord(raw, newId);
        if (s.key === p.key && s.unsure) {
          // 아직 이 문항: 화면의 필기(그 사이 더 쓴 것 포함)를 얹고 저장된 필기도 보이게
          const m = mergeOnto(stored, s.record, s.textHash);
          const history = m.prev ? [{ type: "record", prev: m.prev }, ...s.history] : s.history;
          commit(m.record, history, { unsure: false, lw: m.record ? matchWidth(m.record.layouts, s.width) : 0 });
          flush();
        } else {
          save({ ...p, record: mergeOnto(stored, p.record, p.record?.textHash ?? "").record });
        }
      },
      () => {
        // 또 못 읽음: 덮어쓰지 않게 저장하지 않는다. 이 문항에 있으면 다음 저장 때(문항을 옮길 때 포함) 다시 해 본다
        if (s.key === p.key && !pending) {
          pending = p;
          pendingSince = Date.now();
        }
        emit({ saveError: true });
      },
    );
  }

  function schedule() {
    clearTimeout(timer);
    timer = pending ? setTimeout(tick, SAVE_DELAY) : 0;
  }

  function tick() {
    timer = 0;
    if (busy && Date.now() - pendingSince < SAVE_BUSY_MAX_MS) {
      schedule();
      return;
    }
    flush();
  }

  // archive: false 면 저장할 때 예전 지문 기록을 보관하지 않는다('그래도 보기' — 같은 선을 이번 지문으로 받아들이기만)
  function commit(record, history, extra, archive = true) {
    emit({ record, history, ...extra });
    if (!pending) pendingSince = Date.now();
    pending = { key: s.key, record, unsure: s.unsure, textHash: s.textHash, archive };
    schedule();
  }

  // width 폭의 선을 strokes 로 바꾼 새 record(높이는 지금 높이 — 지금 보이는 폭만 바꾼다)
  function withStrokes(record, width, strokes) {
    const layouts = { ...(record?.layouts ?? {}) };
    if (strokes.length) layouts[width] = { height: s.height, strokes, updatedAt: Date.now() };
    else delete layouts[width];
    return { textHash: record?.textHash ?? s.textHash, layouts };
  }

  const resolveWidth = (record, width) => (record && width ? matchWidth(record.layouts, width) : 0);

  const api = {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSnapshot: () => s,
    hasVisibleInk: () => visibleStrokes(s).length > 0,
    visibleStrokes: () => visibleStrokes(s),
    flush,
    // 펜·마우스가 필기 영역에 닿아 있음(InkInput). 닿아 있는 동안은 저장을 미루고, 떼면 SAVE_DELAY 뒤 저장
    setBusy(b) {
      busy = !!b;
      if (!busy && pending) schedule();
    },

    // 문항이 바뀌면 앞 문항의 저장을 마저 하고 새 문항 필기를 불러온다
    setKey(key, textHash) {
      if (key === s.key) {
        if (textHash !== s.textHash) emit({ textHash });
        return;
      }
      flush();
      const my = ++loadSeq;
      queued = [];
      emit({ key, textHash, loaded: !key, unsure: false, record: null, lw: 0, history: [], future: [], hidden: false, old: null, oldOn: false });
      if (!key) return;
      const done = (record, unsure) => {
        if (my !== loadSeq) return;
        emit({ loaded: true, unsure, record, lw: resolveWidth(record, s.width) });
        const early = queued;
        queued = [];
        for (const st of early) api.addStroke(st);
        loadOld(key, my);
      };
      // 못 불러오면 '필기 없음'처럼 쓰게 두되 unsure — 저장할 때 다시 읽어 합친다(flush)
      db.loadInk(key).then((raw) => done(unpackRecord(raw, newId), false), () => done(null, true));
    },
    setSize(width, height) {
      if (width === s.width && height === s.height) return;
      emit(width === s.width ? { height } : { width, height, lw: resolveWidth(s.record, width) });
    },
    setTool(tool) {
      if (tool === s.tool) return;
      emit({ tool });
      prefs.save({ tool, color: s.color });
    },
    setPen(color) {
      emit({ tool: "pen", color });
      prefs.save({ tool: "pen", color });
    },
    toggleHidden() {
      emit({ hidden: !s.hidden });
    },
    // 예전 필기 흐리게 보기 켬/끔(보여 줄 예전 필기가 없으면 켜지 않음)
    toggleOld() {
      if (!s.oldOn && !hasOld(s)) return;
      emit({ oldOn: !s.oldOn });
    },

    // 선 하나 더하기. 본문이 바뀐 예전 필기는 새로 쓰면 화면에서 비운다(되돌리기로 살릴 수 있고, 저장할 때 따로 보관된다). 받았으면 true
    // (이 문항 필기를 아직 불러오는 중이면 기다렸다가 더한다 — 보통 몇 ms)
    addStroke(stroke) {
      if (!s.width || !stroke?.pts?.length) return false;
      if (!s.loaded) {
        if (!s.key) return false;
        queued.push(stroke);
        return true;
      }
      const history = [...s.history];
      let base = s.record;
      let old = s.old;
      if (isStale(s)) {
        history.push({ type: "record", prev: s.record });
        base = null;
        // 숨겨 둔 예전 필기는 저장할 때 보관된다 — '흐리게 보기'도 끊기지 않게 바로 그것을 보관한 예전 필기로
        old = { record: s.record, at: Date.now() };
      }
      const w = inkWidth(s);
      const st = { tool: stroke.tool, color: stroke.color, w: stroke.w, pts: stroke.pts, id: newId() };
      history.push({ type: "add", width: w, id: st.id });
      const cur = base?.layouts[w]?.strokes ?? EMPTY;
      commit(withStrokes(base ? { ...base, textHash: s.textHash } : null, w, [...cur, st]), history, { hidden: false, future: [], old });
      return true;
    },
    // 지우개에 닿은 선들 지우기. 한 번 끄는 동안(group 같음)은 되돌리기 한 번에 함께 살아난다.
    // 필기를 숨겨 둔 동안은 지우지 않는다(보이지 않는 선이 말없이 지워지지 않게 — InkInput 이 먼저 다시 보이게 한다)
    erase(hits, group) {
      if (s.hidden) return;
      const w = inkWidth(s);
      const cur = visibleStrokes(s);
      const gone = new Set(hits);
      const removed = cur.filter((x) => gone.has(x));
      if (!removed.length) return;
      const history = [...s.history];
      const last = history[history.length - 1];
      if (last && last.type === "erase" && last.group === group && last.width === w) {
        history[history.length - 1] = { ...last, strokes: [...last.strokes, ...removed] };
      } else {
        history.push({ type: "erase", width: w, group, strokes: removed });
      }
      commit(withStrokes(s.record, w, cur.filter((x) => !gone.has(x))), history, { future: [] });
    },
    // 이 문항(지금 폭)의 필기 전체 지우기
    clear() {
      const cur = visibleStrokes(s);
      if (!cur.length) return;
      const w = inkWidth(s);
      commit(withStrokes(s.record, w, []), [...s.history, { type: "clear", width: w, strokes: cur }], { future: [] });
    },
    undo() {
      if (!canUndo(s)) return;
      const last = s.history[s.history.length - 1];
      const history = s.history.slice(0, -1);
      if (last.type === "record") {
        commit(last.prev, history, { future: [...s.future, { type: "record", prev: s.record }] });
        return;
      }
      const cur = s.record?.layouts[last.width]?.strokes ?? EMPTY;
      let next;
      let redo = last; // 지우기·전체 지우기: 다시 하기는 같은 선들을 다시 지운다
      if (last.type === "add") {
        const st = cur.find((x) => x.id === last.id);
        next = cur.filter((x) => x.id !== last.id);
        redo = st ? { type: "add", width: last.width, stroke: st } : null;
      } else {
        next = [...cur, ...last.strokes].sort((a, b) => a.id - b.id);
      }
      commit(withStrokes(s.record, last.width, next), history, { future: redo ? [...s.future, redo] : s.future });
    },
    redo() {
      if (!canRedo(s)) return;
      const e = s.future[s.future.length - 1];
      const future = s.future.slice(0, -1);
      if (e.type === "record") {
        commit(e.prev, [...s.history, { type: "record", prev: s.record }], { future });
        return;
      }
      const cur = s.record?.layouts[e.width]?.strokes ?? EMPTY;
      if (e.type === "add") {
        const next = [...cur.filter((x) => x.id !== e.stroke.id), e.stroke].sort((a, b) => a.id - b.id);
        commit(withStrokes(s.record, e.width, next), [...s.history, { type: "add", width: e.width, id: e.stroke.id }], { future, hidden: false });
        return;
      }
      const gone = new Set(e.strokes.map((x) => x.id));
      commit(withStrokes(s.record, e.width, cur.filter((x) => !gone.has(x.id))), [...s.history, e], { future });
    },
    // 본문이 바뀐 예전 필기: '그래도 보기'는 지금 본문의 필기로 받아들이고, '지우기'는 통째로 지운다(확인을 받은 뒤)
    // (둘 다 흐리게 보던 것은 끈다 — 받아들인 필기는 그대로 보이고, 지운 필기는 볼 것이 없음)
    acceptStale() {
      if (isStale(s)) commit({ ...s.record, textHash: s.textHash }, s.history, { oldOn: false }, false);
    },
    dropRecord() {
      if (s.record) commit(null, [...s.history, { type: "record", prev: s.record }], { future: [], oldOn: false });
    },
  };
  return api;
}
