import { useState } from 'react'
import { BRAND } from './branding.js'

// Memakai /logo.png bila ada; jika tidak, tampilkan logo huruf bulat.
export default function Logo({ size = 120 }) {
  const [failed, setFailed] = useState(false)
  if (!failed) return <img src={BRAND.logo} alt={BRAND.name} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover' }} onError={() => setFailed(true)} />
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={BRAND.name}>
      <circle cx="50" cy="50" r="50" fill="#0a3d6e" />
      <text x="50" y="58" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fbbf24" fontFamily="system-ui, sans-serif">{BRAND.short}</text>
    </svg>
  )
}
