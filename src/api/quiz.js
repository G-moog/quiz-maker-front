import { call } from "./client";

// 함수 이름·반환 모양(camelCase)은 옛 /api 와 같다. 안쪽만 DB 함수(qm_*)를 부른다(설계서 4.1절).
// 문제집: { id, title, subject, createdAt, questionCount }, 문항: { id, type, text, options, answerIndex, answer,
// answers, explanation, questionImageUrl, answerImageUrl, orderIndex }

export function getSets() {
  return call("qm_list_sets", {}, { expect: "array" });
}

export function createSet(title, subject) {
  return call("qm_create_set", { p_title: title, p_subject: subject }, { expect: "object" });
}

// 옛 PUT 과 같이 통째로 바꾼다(과목을 비우면 비워짐)
export function updateSet(id, title, subject) {
  return call("qm_update_set", { p_set_id: id, p_title: title, p_subject: subject }, { expect: "object" });
}

export function deleteSet(id) {
  return call("qm_delete_set", { p_set_id: id }, { expect: "object" });
}

export function getQuestions(setId) {
  return call("qm_list_questions", { p_set_id: setId }, { expect: "array" });
}

export function addQuestion(setId, question) {
  return call("qm_add_question", { p_set_id: setId, p_question: question }, { expect: "object" });
}

// 옛 PUT 과 같이 10칸을 통째로 바꾼다(안 보낸 칸은 비워짐)
export function updateQuestion(questionId, question) {
  return call("qm_update_question", { p_question_id: questionId, p_question: question }, { expect: "object" });
}

export function deleteQuestion(questionId) {
  return call("qm_delete_question", { p_question_id: questionId }, { expect: "object" });
}
