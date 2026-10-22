import { memo, useMemo } from "react";
import { textModel } from "../utils/textBlocks";

// 칸 글 길이. 공백 없이 긴 덩어리(주소 등)는 어차피 칸 안에서 줄바꿈되므로 8글자로만 셈
function cellLength(cell) {
  return cell
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, word, i) => sum + (i > 0 ? 1 : 0) + Math.min(word.length, 8), 0);
}

// 표 열마다 두 값을 정한다 (index.css 의 .qm-table 이 CSS 변수로 사용)
//  w   (--qm-col-w) : 좁은 화면(고정 배치)의 열 너비 비율. 글이 짧은 열(구분·항목)은 좁게, 긴 열은 넓게.
//                     제곱근으로 눌러 긴 열이 폭을 독차지하지 않게 하고(6~16글자 → 최대 약 1.6배),
//                     열이 6개 이상이면 8글자에서 잘라(최대 약 1.15배) 좁은 열에도 두 자리 빈칸 번호·'20도' 같은
//                     짧은 낱말이 한 줄에 들어가게 함 (360px 화면의 7열 표 첫 열 약 37px)
//  min (--qm-min)   : 넓은 화면(자동 배치)의 칸 최소 너비. 열에서 가장 긴 낱말 길이만큼은 지켜 긴 열 옆에서
//                     짧은 이름이 쪼개지지 않게 함. 상한은 열이 적을수록 넉넉히(2열 8글자, 3~4열 6글자, 5열 이상 4글자)
//                     — 'µm(마이크로미터)' 같은 용어 칸이 낱말 가운데서 갈리지 않으면서, 칸 최소 너비 합은
//                     카드 폭(약 590px) 안에 들어가게
function columnSizes(rows) {
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  const maxLen = colCount >= 6 ? 8 : 16;
  const minCap = colCount <= 2 ? 8 : colCount <= 4 ? 6 : 4;
  const cols = Array.from({ length: colCount }, (_, ci) => {
    const cells = rows.map((r) => r[ci] ?? "");
    const len = Math.max(...cells.map(cellLength));
    const word = Math.max(...cells.flatMap((c) => c.split(/\s+/).map((t) => t.length)));
    return { weight: Math.sqrt(Math.min(Math.max(len, 6), maxLen)), min: Math.min(word, minCap) };
  });
  const total = cols.reduce((a, c) => a + c.weight, 0);
  return cols.map((c) => ({ w: `${((c.weight / total) * 100).toFixed(2)}%`, min: `${c.min}em` }));
}

const PRE = { whiteSpace: "pre-wrap" };
const NO_STATES = [];
const HEAD_CLASS = { title: "qm-h qm-h--title", h1: "qm-h qm-h--1", h2: "qm-h qm-h--2" };

// 조각들(글 + 빈칸)을 예전과 같은 모양으로: <span><span pre-wrap>글</span>{빈칸}</span>
function renderParts(parts, start, states, renderBlank, inTable) {
  return parts.map((part, pi) => (
    <span key={pi}>
      <span style={PRE}>{part}</span>
      {pi < parts.length - 1 && (renderBlank ? renderBlank(start + pi, { inTable, state: states[pi] }) : "___")}
    </span>
  ));
}

// 빈칸 상태(states: 이 덩어리·표에 든 빈칸들의 상태)가 같고 그리는 함수가 그대로면 다시 그리지 않는다 —
// 빈칸 하나를 열면 그 빈칸이 든 덩어리(빈칸 8개 안팎 또는 제목 줄 하나) 하나만 다시 그린다(230칸 페이지에서 단추 230개를 다시 만들지 않게)
function sameStates(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const sameProps = (a, b) =>
  a.item === b.item && a.renderBlank === b.renderBlank && a.headings === b.headings && sameStates(a.states, b.states);

// 글 덩어리 하나(textModel 의 seg). 제목 줄(headings 를 켰을 때)은 span 하나로 감싸 색·굵기만 바꾼다 — 글자 크기·줄 높이·여백은
// 그대로라 줄 위치가 바뀌지 않는다(필기는 글 위치 px 로 저장됨). 줄 끝 줄바꿈은 제목 span 밖에 둔다
const Seg = memo(function Seg({ item, states, renderBlank, headings }) {
  if (!headings || !item.kind) return <>{renderParts(item.parts, item.start, states, renderBlank, false)}</>;
  const parts = item.parts;
  const last = parts[parts.length - 1];
  const nl = last.endsWith("\n");
  const body = nl ? [...parts.slice(0, -1), last.slice(0, -1)] : parts;
  return (
    <>
      <span className={HEAD_CLASS[item.kind]} data-qm-h={item.hid}>
        {renderParts(body, item.start, states, renderBlank, false)}
      </span>
      {nl && <span style={PRE}>{"\n"}</span>}
    </>
  );
}, sameProps);

const Table = memo(function Table({ item, states, renderBlank }) {
  const { rows, cells, sizes, start } = item;
  // 열이 7개 이상이면 넓은 화면에서도 칸 최소 너비 합이 카드를 넘을 수 있어 좁은 화면처럼 고정 배치.
  // 열이 5개 이상이면(--many) 휴대폰 세로에서 칸 글자·여백을 한 번 더 줄임(index.css)
  const cls = ["qm-table", sizes.length >= 5 && "qm-table--many", sizes.length >= 7 && "qm-table--fixed"];
  return (
    <table className={cls.filter(Boolean).join(" ")}>
      <colgroup>
        {sizes.map((s, ci) => (
          <col key={ci} style={{ "--qm-col-w": s.w }} />
        ))}
      </colgroup>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => {
              const c = cells[ri][ci];
              return (
                <td key={ci} style={{ "--qm-min": sizes[ci].min }}>
                  {renderParts(c.parts, c.start, states.length ? states.slice(c.start - start) : NO_STATES, renderBlank, true)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}, sameProps);

/**
 * TableAwareText – 문제 텍스트를 "표" 문법(| 칸 | 칸 |)을 인식해 렌더링
 *
 * text        : 원본 문제 문자열 (표 문법 + ___ 빈칸 포함 가능)
 * renderBlank : (index: number, ctx: { inTable: boolean, state }) => ReactNode
 *               "___" 하나를 만날 때마다 읽는 순서대로(글 블록·표 칸을 넘나들며) 0부터 호출
 *               → index 는 answers[index] 와 같은 번호. ctx.inTable 은 표 칸 안이면 true
 *               생략 시 "___"를 문자 그대로 표시 (FILL이 아닌 문항용)
 * blankState  : (선택) 빈칸마다의 상태 배열 — ctx.state 로 넘겨준다. 이걸 쓰고 renderBlank 를 바꾸지 않으면(useCallback)
 *               빈칸 하나가 바뀔 때 그 빈칸이 든 줄만 다시 그린다. 안 쓰면 예전처럼 renderBlank 가 바뀔 때마다 모두 다시 그림
 * headings    : (선택) true 면 '■ ' 절 제목·'□ ' 소제목·첫 줄 '《제목》' 을 색·굵기로 구분하고 [data-qm-h=번호] 를 붙인다
 *               (번호·목록은 utils/textBlocks.js 의 textModel().headings)
 *
 * 줄바꿈·표 모양은 index.css 의 .qm-text / .qm-table 참고 (가로 스크롤 없이 카드 폭 안에서 줄바꿈)
 * 글 블록 앞뒤의 빈 줄은 지운다: 표 바로 뒤 글이 "\n…" 으로 시작하면 pre-wrap 이 빈 줄 한 칸을 더 그려
 * 표 아래 틈이 크게 벌어졌다(표 margin 이 이미 띄워 줌). ___ 수·순서는 그대로라 빈칸 번호는 안전
 */
function TableAwareText({ text, renderBlank, blankState, headings = false }) {
  // 24KB 페이지를 렌더마다 다시 나누지 않게 글이 바뀔 때만
  const model = useMemo(() => {
    const m = textModel(text);
    for (const b of m.blocks) if (b.type === "table") b.sizes = columnSizes(b.rows);
    return m;
  }, [text]);
  const statesOf = (start, count) =>
    blankState && count > 0 ? blankState.slice(start, start + count) : NO_STATES;

  return (
    <>
      {model.blocks.map((block, bi) => {
        if (block.type === "table") {
          return (
            <Table key={`tbl-${bi}`} item={block} states={statesOf(block.start, block.count)} renderBlank={renderBlank} />
          );
        }
        return (
          <div key={`txt-${bi}`} className="qm-text">
            {block.segs.map((seg, si) => (
              <Seg
                key={si}
                item={seg}
                states={statesOf(seg.start, seg.count)}
                renderBlank={renderBlank}
                headings={headings}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// 글·그리는 함수·빈칸 상태가 그대로면(토스트·메모 수·머리 줄만 바뀐 렌더) 본문을 건너뛴다
export default memo(TableAwareText);
