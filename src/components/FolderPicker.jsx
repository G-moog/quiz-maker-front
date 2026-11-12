// 폴더 고르기: 고르기 모드의 '옮기기' 창(FolderPicker)과, 새 문제집·✏ 수정 창의 '폴더' 칩(FolderChips).
// 고르는 값(자리): { kind: 'inbox' } · { kind: 'folder', name } · (칩만) { kind: 'archive' } · { kind: 'new' }(+ 새 폴더 — 이름은 따로)
import { useState } from "react";
import { ARCHIVE_LABEL, INBOX_LABEL, folderNameError, normalizeFolder, pickerOptions, ro, similarFolder } from "../utils/folders";
import { SHEET, useFitOverlay } from "./folderSheet";

// 새 폴더 이름 아래 한 줄: 있는 폴더와 같거나 비슷하면 알린다(같은 폴더가 이름만 조금 달라 둘로 갈리지 않게)
function NewNameHint({ name, names, onUse }) {
  const n = normalizeFolder(name);
  if (!n) return null;
  if (names.includes(n)) {
    return <div style={SHEET.hint}>이미 있는 폴더입니다 — 「{n}」{ro(n)} 넣습니다.</div>;
  }
  const like = similarFolder(n, names);
  if (!like) return null;
  return (
    <div style={SHEET.hint}>
      비슷한 「{like}」 폴더가 있습니다.{" "}
      <button type="button" className="qm-link-btn" onClick={() => onUse(like)}>그 폴더로</button>
    </div>
  );
}

// 칩 하나(누르는 자리 40px — DashboardView.css 의 .qm-chip)
function Chip({ on, onClick, children, extraClass = "", data }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={`qm-chip${on ? " qm-chip--on" : ""}${extraClass}`}
      onClick={onClick}
      data-folder-chip={data}
    >
      {children}
    </button>
  );
}

// ✏ 수정·새 문제집 창의 '폴더' 고르기: 있는 폴더 칩 + 새로 들어옴(+ 보관함) + '+ 새 폴더'(이름 칸).
// onSubmit: 새 폴더 이름 칸에서 Enter(화면 자판의 완료)를 누르면 — 창의 저장·만들기와 같다(자판에 가린 단추를 찾지 않게)
export function FolderChips({ names, value, onChange, newName, onNewName, onSubmit, allowArchive = false, labelId, inputId }) {
  return (
    <>
      <div className="qm-chips" role="radiogroup" aria-labelledby={labelId}>
        <Chip on={value.kind === "inbox"} onClick={() => onChange({ kind: "inbox" })} data="inbox">{INBOX_LABEL}</Chip>
        {names.map((n) => (
          <Chip key={n} on={value.kind === "folder" && value.name === n} onClick={() => onChange({ kind: "folder", name: n })} data={n}>
            {n}
          </Chip>
        ))}
        {allowArchive && (
          <Chip on={value.kind === "archive"} onClick={() => onChange({ kind: "archive" })} extraClass=" qm-chip--archive" data="archive">
            {ARCHIVE_LABEL}
          </Chip>
        )}
        <Chip on={value.kind === "new"} onClick={() => onChange({ kind: "new" })} extraClass=" qm-chip--new" data="new">+ 새 폴더</Chip>
      </div>
      {value.kind === "new" && (
        <>
          <input
            id={inputId}
            style={SHEET.input}
            value={newName}
            onChange={(e) => onNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit?.(); } }}
            placeholder="새 폴더 이름(예: 양액·배지)"
            aria-label="새 폴더 이름"
            enterKeyHint="done"
            autoFocus
          />
          <NewNameHint name={newName} names={names} onUse={(n) => onChange({ kind: "folder", name: n })} />
        </>
      )}
    </>
  );
}

// 고른 카드를 옮길 곳: 새로 들어옴 · 폴더(가나다) · '+ 새 폴더'. 지금 보는 폴더는 고를 수 없게(흐리게).
// 누르면 바로 옮긴다(끝나면 '되돌리기'가 뜨므로 한 번 더 묻지 않음). current: 지금 자리(utils/folders.js).
// 열리면 첫 고를 수 있는 곳에 포커스(키보드·TalkBack 이 창 뒤 막대의 [옮기기]에 머물지 않게)
export default function FolderPicker({ names, current, count, onPick, onClose }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const overlay = useFitOverlay();
  // 줄 열쇠는 자리 열쇠('inbox' · 'folder:<이름>')라 폴더 이름이 'inbox'·'new' 여도 겹치지 않는다(utils/folders.js pickerOptions)
  const options = pickerOptions(names, current);
  const firstOpen = options.find((o) => !o.disabled)?.key ?? null; // 없으면 '+ 새 폴더'에 포커스

  function submitNew() {
    const err = folderNameError(name);
    if (err) { setError(err); return; }
    onPick({ kind: "folder", name: normalizeFolder(name) });
  }

  function option({ key, label, place, disabled }) {
    return (
      <button
        key={key}
        type="button"
        className="qm-pick-option"
        onClick={() => onPick(place)}
        disabled={disabled}
        autoFocus={key === firstOpen}
        data-folder-option={place.kind === "folder" ? place.name : "inbox"}
      >
        <span className="qm-pick-name">{label}</span>
        {disabled && <span className="qm-pick-here">지금 폴더</span>}
      </button>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={SHEET.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qm-pick-title"
        data-folder-picker=""
      >
        <button type="button" style={SHEET.close} onClick={onClose} aria-label="닫기" title="닫기">✕</button>
        <div style={SHEET.title} id="qm-pick-title">어디로 옮길까요?</div>
        <div style={SHEET.sub}>{count}개 골랐습니다 · 하드 짝도 함께 옮깁니다</div>
        <div className="qm-pick-list">
          {options.map(option)}
        </div>
        {adding ? (
          <div className="qm-pick-new">
            <label style={SHEET.label} htmlFor="qm-pick-new-name">새 폴더 이름</label>
            <input
              id="qm-pick-new-name"
              style={SHEET.input}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submitNew(); }}
              placeholder="예: 양액·배지"
              enterKeyHint="done"
              autoFocus
            />
            {error && <div style={SHEET.error} role="alert">{error}</div>}
            <NewNameHint name={name} names={names} onUse={(n) => onPick({ kind: "folder", name: n })} />
            <div style={SHEET.btns}>
              <button type="button" style={SHEET.cancel} onClick={() => { setAdding(false); setError(""); }}>취소</button>
              <button type="button" style={SHEET.confirm} onClick={submitNew} data-folder-new-submit="">새 폴더로 옮기기</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="qm-pick-option qm-pick-option--new"
            onClick={() => setAdding(true)}
            autoFocus={firstOpen === null}
            data-folder-option="new"
          >
            + 새 폴더
          </button>
        )}
      </div>
    </div>
  );
}
