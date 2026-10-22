import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PROD_HOSTS, checkConfig } from './src/config.js'

// 공개 설정 검사(설계서 1.4·5.1절): src/config.js 의 키가 공개 키(sb_publishable_…)가 아니면 빌드를 멈춘다
// — secret·service_role 키가 공개 번들에 실리지 않게. 값이 아직 비어 있으면(Supabase 프로젝트를 만들기 전)
// 경고만 하고 빌드한다(앱은 '앱 설정이 비어 있습니다' 화면만 보임). Vercel 운영 빌드(VERCEL_ENV=production,
// Vercel 이 스스로 넣는 값)에서는 비어 있거나 운영 주소(PROD_HOSTS)가 없어도 멈춘다.
function checkPublicConfig() {
  const result = checkConfig({
    url: SUPABASE_URL,
    key: SUPABASE_PUBLISHABLE_KEY,
    prodHosts: PROD_HOSTS,
    production: process.env.VERCEL_ENV === 'production',
  })
  if (result.error) throw new Error(`[quiz-maker 설정] ${result.error}`)
  if (result.empty) {
    console.warn('[quiz-maker 설정] src/config.js 의 Supabase 주소·공개 키가 아직 비어 있습니다. 앱은 설정 안내 화면만 보입니다.')
  }
}

// https://vite.dev/config/
export default defineConfig(() => {
  checkPublicConfig()
  return {
    plugins: [react()],
    // 운영 빌드 표시(src/utils/startup.js): 운영 빌드는 어느 주소로 열어도 '운영'으로 판정한다(git-master 별칭 등)
    define: {
      __QM_PRODUCTION_BUILD__: JSON.stringify(process.env.VERCEL_ENV === 'production'),
    },
  }
})
