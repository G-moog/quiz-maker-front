const BASE_URL = import.meta.env.VITE_API_URL;

function getToken() {
  return localStorage.getItem("token");
}

/**
 * POST /api/images/upload
 * Request: FormData { file }
 * Response: { url: "https://res.cloudinary.com/..." }
 */
export async function uploadImage(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/api/images/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`이미지 업로드 실패 (HTTP ${res.status})`);
  return res.json(); // { url: "..." }
}
