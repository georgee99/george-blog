'use client'

import { useEffect, useState } from 'react'

export default function SpidermanToggle() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (active) {
      document.body.classList.add('spiderman-mode')
    } else {
      document.body.classList.remove('spiderman-mode')
    }
    return () => {
      document.body.classList.remove('spiderman-mode')
    }
  }, [active])

  const toggle = () => setActive((p) => !p)

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
      aria-pressed={active}
      className="cursor-pointer font-bold"
      style={{
        color: 'red',
        fontFamily:
          'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontStyle: active ? 'normal' : 'italic',
        textDecoration: active ? 'none' : 'underline',
      }}
      title="Click me..."
    >
      Spiderman
    </span>
  )
}