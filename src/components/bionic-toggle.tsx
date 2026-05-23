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
  
  // Initialize from localStorage
  const [active, setActive] = useState(() => {
    // This only runs once during component creation
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem('bionic-reading') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!mounted) return
    try {
      localStorage.setItem('bionic-reading', active ? '1' : '0')
    } catch {}

    const roots = Array.from(document.querySelectorAll('.prose')) as HTMLElement[]

    if (active) {
      document.body.classList.add('bionic-reading')
      roots.forEach((root) => enableBionic(root))
    } else {
      document.body.classList.remove('bionic-reading')
      roots.forEach((root) => restoreOriginal(root))
    }

    // Watch for content changes and re-apply if enabled
    const observer = new MutationObserver(() => {
      if (active) {
        const rs = Array.from(document.querySelectorAll('.prose')) as HTMLElement[]
        rs.forEach((r) => enableBionic(r))
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      // on unmount, remove modifications
      if (!active) return
      const rs = Array.from(document.querySelectorAll('.prose')) as HTMLElement[]
      rs.forEach((r) => restoreOriginal(r))
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
  const original = root.getAttribute('data-bionic-original')
  if (!original) {
    root.setAttribute('data-bionic-original', root.innerHTML)
  } else {
    root.innerHTML = original
  }

  // Work on a cloned container to avoid interfering with React
  const container = document.createElement('div')
  container.innerHTML = root.getAttribute('data-bionic-original') || root.innerHTML

  const skipTags = new Set(['STYLE', 'SCRIPT', 'CODE', 'PRE', 'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'IMG', 'SVG'])

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const ranges: Node[] = []
  while (walker.nextNode()) {
    ranges.push(walker.currentNode)
  }

  for (const textNode of ranges) {
    const text = textNode.nodeValue || ''
    const replaced = transformTextToBionic(text)
    if (replaced === text) continue
    const frag = document.createRange().createContextualFragment(replaced)
    textNode.parentNode?.replaceChild(frag, textNode)
  }

  root.innerHTML = container.innerHTML
}

function restoreOriginal(root: HTMLElement) {
  const original = root.getAttribute('data-bionic-original')
  if (original) {
    root.innerHTML = original
    // Keep the original saved for future toggles - don't remove the attribute
  }
}

function transformTextToBionic(text: string) {
  // Replace words with <strong>prefix</strong>suffix
  // Use a 35% of word length but min 1
  return text.replace(/(\p{L}+|\d+)/gu, (word) => {
    const len = word.length
    const prefix = Math.max(1, Math.ceil(len * 0.35))
    const p = escapeHtml(word.slice(0, prefix))
    const s = escapeHtml(word.slice(prefix))
    return `<strong>${p}</strong>${s}`
  })
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
