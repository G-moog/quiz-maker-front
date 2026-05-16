const BASE_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return localStorage.getItem("token");
}

function downloadByUrl(path) {
  const token = getToken();
  window.location.href = `${BASE_URL}${path}?token=${token}`;
}

export function downloadSet(setId) {
  downloadByUrl(`/api/export/set/${setId}`);
}

export function downloadAll() {
  downloadByUrl("/api/export/all");
}

export function downloadTemplate() {
  downloadByUrl("/api/export/template");
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
