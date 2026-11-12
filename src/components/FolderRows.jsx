// 대시보드 첫 화면의 폴더 목록(노션 공부 홈처럼 메뉴만): '복습 차례 ›' 한 줄 + 폴더 줄 + '+ 새 폴더'.
// 폴더 줄: 이름 · 카드 수 · 마지막 공부 · 미해결 메모 수(있을 때) · 이번 주 n/N(0이면 숨김) · 새 n(있을 때). 누르면 그 폴더 보기.
// 값은 DashboardView 가 utils/folders.js 로 셈해 넘긴다(여기서는 그리기만). 배치·크기는 DashboardView.css 의 .qm-folder-*
import { PencilIcon } from "./NoteIcons";

// rows: [{ key, kind: 'inbox'|'folder'|'archive', name, count, lastText, notes, week, fresh }]
// review: { badge, text, lastText } | null(공부한 카드가 없음 — 줄을 그리지 않음)
// flat: 폴더가 없는 평평한 목록 아래에 '보관함' 한 줄만 그릴 때(data-folder-list="flat")
export default function FolderRows({ rows, review, onOpen, onOpenReview, onNewFolder, canAdd, flat = false }) {
  return (
    <div className={flat ? "qm-folders qm-folders--flat" : "qm-folders"} data-folder-list={flat ? "flat" : ""}>
      {review && (
        <button
          type="button"
          className="qm-review-row"
          onClick={onOpenReview}
          data-review-row=""
          title="보관함 밖 모든 문제집을 공부한 지 오래된 것부터"
        >
          <span className="qm-review-label">복습 차례 ›</span>
          <span className="qm-review-title">
            {review.badge && <span className="qm-title-tag">{review.badge}</span>}
            {review.text}
          </span>
          <span className="qm-review-when">{review.lastText}</span>
        </button>
      )}
      <div className="qm-folder-grid">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`qm-folder-row qm-folder-row--${r.kind}`}
            onClick={() => onOpen(r)}
            data-folder-row={r.key}
            data-folder-kind={r.kind}
          >
            <span className="qm-folder-text">
              <span className="qm-folder-name">{r.name}</span>
              <span className="qm-folder-meta">
                <span>{r.count}개</span>
                {r.lastText && <span><span className="qm-folder-dot">· </span>{r.lastText}</span>}
                {r.notes > 0 && (
                  <span className="qm-folder-notes" title={`미해결 질문 메모 ${r.notes}개`} aria-label={`미해결 질문 메모 ${r.notes}개`}>
                    <PencilIcon size={10} />{r.notes > 99 ? "99+" : r.notes}
                  </span>
                )}
                {r.week > 0 && (
                  <span title="이번 주(월요일부터)에 공부한 카드 수 / 카드 수">
                    <span className="qm-folder-dot">· </span>이번 주 {r.week}/{r.count}
                  </span>
                )}
                {r.fresh > 0 && <span className="qm-folder-new" title="일주일 안에 생겼고 아직 안 푼 카드">새 {r.fresh}</span>}
              </span>
            </span>
            <span className="qm-folder-chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      {canAdd && (
        <button type="button" className="qm-new-folder" onClick={onNewFolder} data-new-folder="">+ 새 폴더</button>
      )}
    </div>
  );
}
