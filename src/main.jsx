import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const root = createRoot(document.getElementById('root'))

// 펜 시험 페이지(로그인·서버 없이): 주소 끝에 ?pentest (또는 #pentest). 앱 본체와 따로 불러온다
if (new URLSearchParams(window.location.search).has('pentest') || window.location.hash === '#pentest') {
  import('./views/PenTestView.jsx').then(({ default: PenTestView }) => {
    root.render(
      <StrictMode>
        <PenTestView />
      </StrictMode>,
    )
  })
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
