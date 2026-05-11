const BASE_URL = "http://localhost:8080";

function getToken() {
  return localStorage.getItem("token");
}

async function downloadBlob(path, filename) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSet(setId, title) {
  return downloadBlob(`/api/export/set/${setId}`, `${title}.xlsx`);
}

export function downloadAll() {
  return downloadBlob("/api/export/all", "전체_문제집.xlsx");
}

export function downloadTemplate() {
  return downloadBlob("/api/export/template", "업로드_양식.xlsx");
}

export async function uploadToSet(setId, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/api/import/set/${setId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `업로드 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

export async function uploadAsNew(file, title, subject) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  form.append("subject", subject ?? "");
  const res = await fetch(`${BASE_URL}/api/import/new`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `업로드 실패 (HTTP ${res.status})`);
  }
  return res.json();
}
