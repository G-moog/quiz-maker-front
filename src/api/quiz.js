import { authFetch } from "./client";

export function getSets() {
  return authFetch("/api/sets");
}

export function createSet(title, subject) {
  return authFetch("/api/sets", {
    method: "POST",
    body: JSON.stringify({ title, subject }),
  });
}

export function updateSet(id, title, subject) {
  return authFetch(`/api/sets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ title, subject }),
  });
}

export function deleteSet(id) {
  return authFetch(`/api/sets/${id}`, { method: "DELETE" });
}

export function getQuestions(setId) {
  return authFetch(`/api/sets/${setId}/questions`);
}

export function addQuestion(setId, question) {
  return authFetch(`/api/sets/${setId}/questions`, {
    method: "POST",
    body: JSON.stringify(question),
  });
}

export function updateQuestion(questionId, question) {
  return authFetch(`/api/questions/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(question),
  });
}

export function deleteQuestion(questionId) {
  return authFetch(`/api/questions/${questionId}`, { method: "DELETE" });
}
