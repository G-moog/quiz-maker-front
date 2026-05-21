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
  // multipart/form-data CORS preflight에서 Authorization 헤더가 차단되는 경우를 방지하기 위해
  // Authorization 헤더 대신 ?token= 쿼리 파라미터로 인증 (백엔드 JwtFilter와 동일한 방식)
  const res = await fetch(`${BASE_URL}/api/images/upload?token=${getToken()}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`이미지 업로드 실패 (HTTP ${res.status})`);
  return res.json(); // { url: "..." }
}
