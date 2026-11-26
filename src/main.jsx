import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

class Boundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 640, margin: '40px auto' }}>
        <h2>Terjadi kesalahan pada aplikasi</h2>
        <p>Muat ulang halaman. Jika berulang, kirim pesan di bawah ini ke pengelola.</p>
        <pre style={{ background: '#fef2f2', color: '#991b1b', padding: 12, whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>)
