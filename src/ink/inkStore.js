import { loadInk, saveInk } from "./inkDb";
import { PEN_COLORS, packRecord, unpackRecord } from "./geometry";

// 필기 상태 보관소(React 바깥). 풀기 화면 하나에 하나를 만들고, 필기 영역·도구 막대가 useSyncExternalStore 로 읽는다.
// 선이 늘어도 문항 본문(긴 글)을 다시 그리지 않게 상태를 화면(SolveView) 밖에 둔다.
//  record  : 지금 문항의 필기 { textHash, layouts: { "<영역 폭>": { height, strokes, updatedAt } } } (없으면 null)
//            폭(정수 px)마다 따로 — 가로·세로 화면이 각자 자기 필기를 갖는다
//  history : 이 문항에서 이번에 한 일(되돌리기용). 문항이 바뀌면 비운다
//  unsure  : 이 문항 필기를 불러오지 못함(저장소 오류). 이때 쓴 필기는 저장 직전에 다시 읽어 저장된 필기 위에 얹는다 —
//            그대로 저장하면 보지 못한 예전 필기(다른 폭 포함)를 덮어써 없애므로. 다시 읽지도 못하면 저장하지 않고 경고만
//  저장은 바뀐 뒤 SAVE_DELAY 만큼 몰아서(긋기·지우기가 이어지면 마지막 한 번), 문항을 옮기거나 화면을 떠날 때는 바로
const SAVE_DELAY = 500;
const EMPTY = Object.freeze([]);

let seq = 0;
const newId = () => ++seq; // 선 id: 그은 순서대로 커진다(지운 선을 되돌릴 때 제자리로)

// 본문이 바뀌어(지문 다름) 예전 필기를 숨겨야 하는가
export function isStale(s) {
  return !!s.record && s.record.textHash !== s.textHash;
}

// 지금 화면에 그릴 선(지금 폭의 것). 불러오는 중·폭을 아직 모름·본문이 바뀜이면 없음
export function visibleStrokes(s) {
  if (!s.loaded || !s.width || isStale(s)) return EMPTY;
  return s.record?.layouts[s.width]?.strokes ?? EMPTY;
}

// 다른 폭에서 쓴 필기가 있는 폭들(지금 폭에는 없을 때만)
export function otherWidths(s) {
  if (!s.loaded || !s.width || !s.record || isStale(s) || visibleStrokes(s).length) return EMPTY;
  return Object.keys(s.record.layouts).map(Number).filter((w) => w !== s.width && s.record.layouts[w].strokes.length);
}

// 저장한 때와 영역 높이가 크게 다른가(글자 크기·글꼴이 바뀌어 필기가 어긋날 수 있음)
export function heightDrift(s) {
  const l = visibleStrokes(s).length ? s.record.layouts[s.width] : null;
  if (!l || !l.height || !s.height) return false;
  return Math.abs(s.height - l.height) > Math.max(30, l.height * 0.02);
}

const hasStrokes = (rec) => !!rec && Object.values(rec.layouts).some((l) => l.strokes.length);

// 불러오지 못한 채 쓴 필기(mine)를 저장소에 있던 필기(stored) 위에 얹는다(보지 못한 필기를 지우지 않게).
// 폭마다 저장된 선 위에 새 선을 더하고 다른 폭은 그대로 둔다. 저장된 필기가 다른 본문(지문 다름)의 것이면
// 평소 '바뀐 본문 위에 새로 쓰기'처럼 새 필기로 바꾸고 예전 것은 prev 로 돌려준다(되돌리기로 살림)
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

export function createInkStore() {
  let s = {
    key: null, textHash: "", loaded: false, unsure: false, record: null,
    width: 0, height: 0,
    tool: "pen", color: PEN_COLORS[0].value, hidden: false,
    history: [], saveError: false,
  };
  const listeners = new Set();
  let timer = 0;
  let pending = null;
  let loadSeq = 0;
  let queued = []; // 불러오기가 끝나기 전에 그은 선(끝나면 더한다)

  function emit(patch) {
    s = { ...s, ...patch };
    for (const l of [...listeners]) l();
  }

  function save(key, record) {
    saveInk(key, packRecord(record)).then(
      () => { if (s.saveError) emit({ saveError: false }); },
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
      save(p.key, p.record);
      return;
    }
    // 불러오지 못한 채 쓴 필기: 다시 읽어 저장된 필기 위에 얹은 뒤 저장한다
    loadInk(p.key).then(
      (raw) => {
        const stored = unpackRecord(raw, newId);
        if (s.key === p.key && s.unsure) {
          // 아직 이 문항: 화면의 필기(그 사이 더 쓴 것 포함)를 얹고 저장된 필기도 보이게
          const m = mergeOnto(stored, s.record, s.textHash);
          const history = m.prev ? [{ type: "record", prev: m.prev }, ...s.history] : s.history;
          commit(m.record, history, { unsure: false });
          flush();
        } else {
          save(p.key, mergeOnto(stored, p.record, p.record?.textHash ?? "").record);
        }
      },
      () => {
        // 또 못 읽음: 덮어쓰지 않게 저장하지 않는다. 이 문항에 있으면 다음 저장 때(문항을 옮길 때 포함) 다시 해 본다
        if (s.key === p.key && !pending) pending = p;
        emit({ saveError: true });
      },
    );
  }

  function commit(record, history, extra) {
    emit({ record, history, ...extra });
    pending = { key: s.key, record, unsure: s.unsure };
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  }

  // width 폭의 선을 strokes 로 바꾼 새 record. 높이는 지금 폭이면 지금 높이, 아니면 저장된 높이
  function withStrokes(record, width, strokes) {
    const layouts = { ...(record?.layouts ?? {}) };
    if (strokes.length) {
      const height = width === s.width ? s.height : (layouts[width]?.height ?? 0);
      layouts[width] = { height, strokes, updatedAt: Date.now() };
    } else {
      delete layouts[width];
    }
    return { textHash: record?.textHash ?? s.textHash, layouts };
  }

  const api = {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSnapshot: () => s,
    hasVisibleInk: () => visibleStrokes(s).length > 0,
    visibleStrokes: () => visibleStrokes(s),
    flush,

    // 문항이 바뀌면 앞 문항의 저장을 마저 하고 새 문항 필기를 불러온다
    setKey(key, textHash) {
      if (key === s.key) {
        if (textHash !== s.textHash) emit({ textHash });
        return;
      }
      flush();
      const my = ++loadSeq;
      queued = [];
      emit({ key, textHash, loaded: !key, unsure: false, record: null, history: [], hidden: false });
      if (!key) return;
      const done = (record, unsure) => {
        if (my !== loadSeq) return;
        emit({ loaded: true, unsure, record });
        const early = queued;
        queued = [];
        for (const st of early) api.addStroke(st);
      };
      // 못 불러오면 '필기 없음'처럼 쓰게 두되 unsure — 저장할 때 다시 읽어 합친다(flush)
      loadInk(key).then((raw) => done(unpackRecord(raw, newId), false), () => done(null, true));
    },
    setSize(width, height) {
      if (width !== s.width || height !== s.height) emit({ width, height });
    },
    setTool(tool) {
      if (tool !== s.tool) emit({ tool });
    },
    setPen(color) {
      emit({ tool: "pen", color });
    },
    toggleHidden() {
      emit({ hidden: !s.hidden });
    },

    // 선 하나 더하기. 본문이 바뀐 예전 필기는 새로 쓰면 비운다(되돌리기로 살릴 수 있음). 받았으면 true
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
      if (isStale(s)) {
        history.push({ type: "record", prev: s.record });
        base = null;
      }
      const st = { tool: stroke.tool, color: stroke.color, w: stroke.w, pts: stroke.pts, id: newId() };
      history.push({ type: "add", width: s.width, id: st.id });
      const cur = base?.layouts[s.width]?.strokes ?? EMPTY;
      commit(withStrokes(base ? { ...base, textHash: s.textHash } : null, s.width, [...cur, st]), history, { hidden: false });
      return true;
    },
    // 지우개에 닿은 선들 지우기. 한 번 끄는 동안(group 같음)은 되돌리기 한 번에 함께 살아난다.
    // 필기를 숨겨 둔 동안은 지우지 않는다(보이지 않는 선이 말없이 지워지지 않게 — InkInput 이 먼저 다시 보이게 한다)
    erase(hits, group) {
      if (s.hidden) return;
      const cur = visibleStrokes(s);
      const gone = new Set(hits);
      const removed = cur.filter((x) => gone.has(x));
      if (!removed.length) return;
      const history = [...s.history];
      const last = history[history.length - 1];
      if (last && last.type === "erase" && last.group === group && last.width === s.width) {
        history[history.length - 1] = { ...last, strokes: [...last.strokes, ...removed] };
      } else {
        history.push({ type: "erase", width: s.width, group, strokes: removed });
      }
      commit(withStrokes(s.record, s.width, cur.filter((x) => !gone.has(x))), history);
    },
    // 이 문항(지금 폭)의 필기 전체 지우기
    clear() {
      const cur = visibleStrokes(s);
      if (!cur.length) return;
      commit(withStrokes(s.record, s.width, []), [...s.history, { type: "clear", width: s.width, strokes: cur }]);
    },
    undo() {
      const last = s.history[s.history.length - 1];
      if (!last) return;
      const history = s.history.slice(0, -1);
      if (last.type === "record") {
        commit(last.prev, history);
        return;
      }
      const cur = s.record?.layouts[last.width]?.strokes ?? EMPTY;
      const next = last.type === "add"
        ? cur.filter((x) => x.id !== last.id)
        : [...cur, ...last.strokes].sort((a, b) => a.id - b.id);
      commit(withStrokes(s.record, last.width, next), history);
    },
    // 본문이 바뀐 예전 필기: '그래도 보기'는 지금 본문의 필기로 받아들이고, '지우기'는 통째로 지운다
    acceptStale() {
      if (isStale(s)) commit({ ...s.record, textHash: s.textHash }, s.history);
    },
    dropRecord() {
      if (s.record) commit(null, [...s.history, { type: "record", prev: s.record }]);
    },
  };
  return api;
}
