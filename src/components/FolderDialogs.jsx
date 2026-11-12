// 폴더 창들: ✕ 를 눌렀을 때 묻기(보관함으로·완전히 지우기), 폴더 이름 바꾸기(있는 이름이면 합치기), 새 폴더(이름 + 넣을 문제집).
// 쓰기는 하지 않고 고른 것만 돌려준다 — 쓰기(새로 받기·차례로 updateSet·되돌리기)는 DashboardView 가 한 길로 한다
import { useState } from "react";
import { displayTitle, folderNameError, normalizeFolder, ro, similarFolder, INBOX_LABEL } from "../utils/folders";
import { SHEET, useFitOverlay } from "./folderSheet";

// ✕: 지우면 문항·공부 기록이 함께 사라지므로 보관함을 먼저 권한다. 완전히 지우기는 지금의 지우기 흐름(묻고 하드 먼저)
export function DeleteChoiceDialog({ title, hasHard, onArchive, onDelete, onClose }) {
  const overlay = useFitOverlay();
  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={SHEET.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qm-del-title"
        data-delete-choice=""
      >
        <button type="button" style={SHEET.close} onClick={onClose} aria-label="닫기" title="닫기">✕</button>
        <div style={SHEET.title} id="qm-del-title">이 문제집을 어떻게 할까요?</div>
        <div className="qm-del-name">{title}</div>
        <div style={SHEET.hint}>
          보관함으로 옮기면 문항·공부 기록·질문 메모가 그대로 남고, 언제든 꺼낼 수 있습니다.
          완전히 지우면 문항과 공부 기록이 사라집니다{hasHard ? "(하드 문제집도 함께)" : ""}.
        </div>
        <div className="qm-del-btns">
          <button type="button" style={{ ...SHEET.confirm, flex: "none" }} onClick={onArchive} data-delete-archive="" autoFocus>
            보관함으로 (권함)
          </button>
          <button type="button" style={{ ...SHEET.danger, flex: "none" }} onClick={onDelete} data-delete-forever="">완전히 지우기</button>
          <button type="button" style={{ ...SHEET.cancel, flex: "none" }} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ⋯ → 이름 바꾸기. 있는 폴더 이름이면 합칠지 묻고(창) 합친다. 바꾸지 않았으면 그냥 닫는다
export function RenameFolderDialog({ name, names, onRename, onClose }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const overlay = useFitOverlay();
  const next = normalizeFolder(value);
  const others = names.filter((n) => n !== name);
  const merging = next !== name && others.includes(next);
  const like = !merging && next && next !== name ? similarFolder(next, others) : "";

  function submit() {
    if (next === name) { onClose(); return; }
    const err = folderNameError(value);
    if (err) { setError(err); return; }
    if (merging && !confirm(`「${next}」 폴더가 이미 있습니다.\n두 폴더를 합칠까요? 「${name}」의 문제집이 모두 「${next}」${ro(next)} 갑니다.`)) return;
    onRename(next, merging);
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={SHEET.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qm-rename-title"
        data-rename-folder=""
      >
        <button type="button" style={SHEET.close} onClick={onClose} aria-label="닫기" title="닫기">✕</button>
        <div style={SHEET.title} id="qm-rename-title">폴더 이름 바꾸기</div>
        <div style={SHEET.sub}>있는 폴더 이름으로 바꾸면 두 폴더를 합칩니다.</div>
        <label style={SHEET.label} htmlFor="qm-rename-input">새 이름</label>
        <input
          id="qm-rename-input"
          style={SHEET.input}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }}
          enterKeyHint="done"
          autoFocus
        />
        {error && <div style={SHEET.error} role="alert">{error}</div>}
        {merging && <div style={SHEET.hint}>「{next}」 폴더와 합칩니다.</div>}
        {like && <div style={SHEET.hint}>비슷한 「{like}」 폴더가 있습니다. 합치려면 그 이름 그대로 적어 주세요.</div>}
        <div style={SHEET.btns}>
          <button type="button" style={SHEET.cancel} onClick={onClose}>취소</button>
          <button type="button" style={SHEET.confirm} onClick={submit} data-rename-submit="">{merging ? "합치기" : "바꾸기"}</button>
        </div>
      </div>
    </div>
  );
}

// '+ 새 폴더': 이름 + 넣을 문제집 고르기(폴더는 문제집이 하나라도 들어 있어야 보인다 — 빈 폴더는 둘 수 없음).
// items: [{ id: 카드의 원래 문제집 id, title, folder: 지금 폴더 이름('' = 새로 들어옴) }] — 보관함 밖 카드, 폴더 목록 순서
export function NewFolderDialog({ items, names, onCreate, onClose }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState("");
  const overlay = useFitOverlay();
  const n = normalizeFolder(name);
  const like = n && !names.includes(n) ? similarFolder(n, names) : "";

  function toggle(id) {
    const k = String(id);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    setError("");
  }

  function submit() {
    const err = folderNameError(name);
    if (err) { setError(err); return; }
    if (picked.size === 0) { setError("넣을 문제집을 하나 이상 골라 주세요."); return; }
    onCreate(n, [...picked]);
  }

  // 이름 칸의 Enter(화면 자판의 완료): 고른 문제집이 있으면 만들기, 없으면 자판만 내린다(아래 넣을 문제집 목록이 보이게)
  function onNameKey(e) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (picked.size > 0) submit();
    else e.currentTarget.blur();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={SHEET.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qm-newfolder-title"
        data-new-folder-dialog=""
      >
        <button type="button" style={SHEET.close} onClick={onClose} aria-label="닫기" title="닫기">✕</button>
        <div style={SHEET.title} id="qm-newfolder-title">새 폴더</div>
        <div style={SHEET.sub}>문제집이 하나라도 들어 있어야 폴더가 보입니다.</div>
        <label style={SHEET.label} htmlFor="qm-newfolder-name">폴더 이름</label>
        <input
          id="qm-newfolder-name"
          style={SHEET.input}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={onNameKey}
          placeholder="예: 양액·배지"
          enterKeyHint="done"
          autoFocus
        />
        {n && names.includes(n) && <div style={SHEET.hint}>이미 있는 폴더입니다 — 고른 문제집을 「{n}」에 더 넣습니다.</div>}
        {like && <div style={SHEET.hint}>비슷한 「{like}」 폴더가 있습니다. 같은 폴더라면 그 이름 그대로 적어 주세요.</div>}
        <div style={SHEET.label} id="qm-newfolder-list">넣을 문제집 {picked.size > 0 ? `(${picked.size}개)` : ""}</div>
        <div className="qm-check-list" role="group" aria-labelledby="qm-newfolder-list">
          {items.map((it) => {
            const t = displayTitle(it.title);
            const on = picked.has(String(it.id));
            return (
              <label key={it.id} className={on ? "qm-check-row qm-check-row--on" : "qm-check-row"} data-new-folder-item={it.id}>
                <input type="checkbox" checked={on} onChange={() => toggle(it.id)} />
                <span className="qm-check-title">
                  {t.badge && <span className="qm-title-tag">{t.badge}</span>}
                  {t.text}
                </span>
                <span className="qm-check-folder">{it.folder || INBOX_LABEL}</span>
              </label>
            );
          })}
        </div>
        {error && <div style={SHEET.error} role="alert">{error}</div>}
        <div style={SHEET.btns}>
          <button type="button" style={SHEET.cancel} onClick={onClose}>취소</button>
          <button type="button" style={SHEET.confirm} onClick={submit} data-new-folder-submit="">만들기</button>
        </div>
      </div>
    </div>
  );
}
