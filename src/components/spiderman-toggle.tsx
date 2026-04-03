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

  return (
    <span
      onClick={() => setActive((prev) => !prev)}
      style={{ cursor: 'pointer', fontWeight: 'bold', color: active ? 'red' : 'white' }}
      title="Click me..."
    >
      Spiderman
    </span>
  )
}
