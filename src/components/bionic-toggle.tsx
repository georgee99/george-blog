'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

// Track client-side mount status to avoid hydration mismatch
function useIsMounted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('focus', cb)
      return () => window.removeEventListener('focus', cb)
    },
    () => true,
    () => false,
  )
}

export default function BionicToggle() {
  const mounted = useIsMounted()
  
  // Always default to false - no persistence across page loads
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!mounted) return

    const roots = Array.from(document.querySelectorAll('.prose')) as HTMLElement[]

    if (active) {
      document.body.classList.add('bionic-reading')
      roots.forEach((root) => enableBionic(root))
    } else {
      document.body.classList.remove('bionic-reading')
      roots.forEach((root) => restoreOriginal(root))
    }

    // Cleanup on unmount
    return () => {
      if (active) {
        const rs = Array.from(document.querySelectorAll('.prose')) as HTMLElement[]
        rs.forEach((r) => restoreOriginal(r))
      }
    }
  }, [active, mounted])

  const toggle = () => setActive((p) => !p)

  // Render stable placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden />
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 ${
        active ? 'bg-neutral-100 dark:bg-neutral-800' : ''
      }`}
      aria-label="Toggle bionic reading"
      aria-pressed={active}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6" cy="15" r="4"/>
        <circle cx="18" cy="15" r="4"/>
        <line x1="10" y1="15" x2="14" y2="15"/>
        <path d="M6 11V7a2 2 0 0 1 2-2h1"/>
        <path d="M18 11V7a2 2 0 0 0-2-2h-1"/>
      </svg>
    </button>
  )
}

function enableBionic(root: HTMLElement) {
  if (!root) return
  
  // Skip if already processed
  if (root.hasAttribute('data-bionic-active')) return
  
  // Save original only once
  if (!root.hasAttribute('data-bionic-original')) {
    root.setAttribute('data-bionic-original', root.innerHTML)
  }

  const original = root.getAttribute('data-bionic-original')!
  const skipTags = new Set(['STYLE', 'SCRIPT', 'CODE', 'PRE', 'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'IMG', 'SVG'])

  // Process in memory first
  const temp = document.createElement('div')
  temp.innerHTML = original

  const walker = document.createTreeWalker(
    temp,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement
        if (!parent || skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      }
    }
  )

  const nodesToReplace: Array<{node: Node, html: string}> = []
  let node: Node | null
  
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || ''
    // Simplified regex - much faster than \p{L}+
    const transformed = text.replace(/\b([a-zA-Z]{2,})\b/g, (word) => {
      const len = word.length
      const splitPoint = Math.max(1, Math.ceil(len * 0.35))
      return `<strong>${word.slice(0, splitPoint)}</strong>${word.slice(splitPoint)}`
    })
    
    if (transformed !== text) {
      nodesToReplace.push({node, html: transformed})
    }
  }

  // Apply all replacements
  for (const {node, html} of nodesToReplace) {
    const span = document.createElement('span')
    span.innerHTML = html
    node.parentNode?.replaceChild(span, node)
  }

  root.innerHTML = temp.innerHTML
  root.setAttribute('data-bionic-active', '1')
}

function restoreOriginal(root: HTMLElement) {
  const original = root.getAttribute('data-bionic-original')
  if (original) {
    root.innerHTML = original
    root.removeAttribute('data-bionic-active')
  }
}
