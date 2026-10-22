import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const root = createRoot(document.getElementById('root'))

// 펜 시험 페이지(로그인·서버 없이): 주소 끝에 ?pentest (또는 #pentest). 앱 본체와 따로 불러온다
if (new URLSearchParams(window.location.search).has('pentest') || window.location.hash === '#pentest') {
  import('./views/PenTestView.jsx').then(({ default: PenTestView }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <PenTestView />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
} else {
  // 맨 바깥 경계: App 자체(시작 판정·로그인 화면 등)가 그리다 실패해도 빈 화면이 되지 않게.
  // 화면 안쪽(대시보드·풀기·편집…)은 App 안의 경계가 먼저 받아 '목록으로'로 대시보드에 돌아간다
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
