// 전체 백업(JSON 파일 하나): 문제집 → 문항, 질문 메모를 지금 있는 api(읽기 함수)로 모두 받아 묶는다.
// 서버에는 쓰지 않는다. 화면 없이 값만 다루는 부분(buildBackup·backupFileName·backupSummary)은 Node 시험에서 그대로 부른다.
//
// 파일 꼴(version 1):
//   { app: "quiz-maker", version: 1, exportedAt: ISO, username,
//     sets: [{ ...문제집(qm_list_sets 한 줄), questions: [문항(qm_list_questions 한 줄), …] }, …],
//     notes: [메모(qm_list_notes, 해결·미해결 모두), …],
//     ...extras }
// 확장 자리(extras): 다른 자료를 buildBackup({ extras: { … } }) 로 맨 위 칸에 더한다. 위의 기본 칸 이름과 겹치면 오류(기본 칸을 덮지 않게).
// 지금 대시보드가 넣는 것(DashboardView backupExtras):
//   ink:   이 기기 필기(ink/inkBackup.js exportInkJson — { app: "quiz-maker-ink", items: […] })
//   study: 공부 기록(utils/studyState.js exportStudy — { version: 1, records: { [문제집 id]: { v, at, ct, days, …이어 보기 } } },
//          다른 기기 기록과 합친 이 기기 사본)
export const BACKUP_APP = "quiz-maker";
export const BACKUP_VERSION = 1;
const CORE_KEYS = new Set(["app", "version", "exportedAt", "username", "sets", "notes"]);

// api: { getSets(), getQuestions(setId), listNotes({ status }) } — src/api/quiz.js·notes.js 의 함수 그대로
// onProgress({ phase: "sets" | "notes", done, total }) — 화면의 '문제집 12/49'
// concurrency: 문항을 동시에 받는 문제집 수(서버·휴대폰 데이터에 무리 없게 4)
export async function buildBackup({ api, username = "", concurrency = 4, onProgress, extras, now = new Date() }) {
  const sets = await api.getSets();
  if (!Array.isArray(sets)) throw new Error("문제집 목록을 받지 못했습니다.");
  const total = sets.length;
  onProgress?.({ phase: "sets", done: 0, total });

  const out = new Array(total);
  let next = 0;
  let done = 0;
  let failed = false;
  async function questionsOf(s) {
    try {
      return await api.getQuestions(s.id);
    } catch (e) {
      // 잠깐 끊긴 연결이면 한 번 더. 로그인이 끊긴 것이면 다시 해도 소용없다
      if (e?.sessionExpired || e?.status === 401) throw e;
      return api.getQuestions(s.id);
    }
  }
  async function worker() {
    while (!failed && next < total) {
      const i = next++;
      const s = sets[i];
      let qs;
      try {
        qs = await questionsOf(s);
      } catch (e) {
        failed = true;
        const err = new Error(`문제집 「${s.title ?? s.id}」의 문항을 받지 못했습니다. ${e?.message || ""}`.trim());
        err.cause = e;
        throw err;
      }
      if (!Array.isArray(qs)) {
        failed = true;
        throw new Error(`문제집 「${s.title ?? s.id}」의 문항 목록이 비정상입니다.`);
      }
      out[i] = { ...s, questions: qs };
      done++;
      onProgress?.({ phase: "sets", done, total });
    }
  }
  const n = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: n }, worker));

  onProgress?.({ phase: "notes", done: 0, total: 1 });
  const notes = await api.listNotes({ status: "all" });
  if (!Array.isArray(notes)) throw new Error("질문 메모 목록을 받지 못했습니다.");
  onProgress?.({ phase: "notes", done: 1, total: 1 });

  const data = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    username,
    sets: out,
    notes,
  };
  if (extras && typeof extras === "object") {
    for (const [k, v] of Object.entries(extras)) {
      if (CORE_KEYS.has(k)) throw new Error(`백업 추가 칸 이름 '${k}' 는 기본 칸과 겹칩니다.`);
      data[k] = v;
    }
  }
  return data;
}

// quiz-maker-backup-20261022-1530.json (이 기기 시각)
export function backupFileName(date = new Date()) {
  const p = (v) => String(v).padStart(2, "0");
  return `quiz-maker-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

// 끝난 뒤 안내용 수: { sets, questions, notes, study(공부 기록 문제집 수) }
export function backupSummary(data) {
  const sets = Array.isArray(data?.sets) ? data.sets : [];
  const study = data?.study?.records;
  return {
    sets: sets.length,
    questions: sets.reduce((sum, s) => sum + (Array.isArray(s.questions) ? s.questions.length : 0), 0),
    notes: Array.isArray(data?.notes) ? data.notes.length : 0,
    study: study && typeof study === "object" ? Object.keys(study).length : 0,
  };
}

// 브라우저에서 파일로 내려받기(홈 화면 앱·휴대폰 크롬은 '다운로드' 알림으로 받음)
export function downloadJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 바로 지우면 일부 브라우저가 받기 전에 주소가 사라진다
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
