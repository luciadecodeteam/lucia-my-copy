// lucia-secure/frontend/src/components/Composer.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import '../styles/composer.css'

export default function Composer({ value, setValue, onSend, onCancel, busy }) {
  const rowRef  = useRef(null)      // measure the visible row (not the wrapper)
  const taRef   = useRef(null)
  const [hasText, setHasText] = useState(Boolean(value?.trim()))

  // Grow/Shrink textarea (guaranteed shrink when empty)
  const resizeTA = useCallback(() => {
    const el = taRef.current
    if (!el) return
    const cs  = getComputedStyle(el)
    const min = parseFloat(cs.getPropertyValue('--ta-min')) || 48
    const max = parseFloat(cs.getPropertyValue('--ta-max')) || 240

    el.style.height = 'auto'
    const next = Math.max(min, Math.min(el.scrollHeight, max))
    el.style.height = next + 'px'
    if (!el.value.trim()) el.style.height = min + 'px'
  }, [])

  // Enter to send
  function key(e){
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault()
      if (!busy && hasText) onSend()
    }
  }

  // state
  useEffect(() => setHasText(Boolean((value || '').trim())), [value])

  // resize on input and when value changes programmatically
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    const onInput = () => resizeTA()
    el.addEventListener('input', onInput)
    resizeTA()
    return () => el.removeEventListener('input', onInput)
  }, [resizeTA])

  useEffect(() => {
    const id = requestAnimationFrame(resizeTA)
    return () => cancelAnimationFrame(id)
  }, [value, resizeTA])

  // Keep thread padding in sync with *row* height
  useEffect(() => {
    const root = document.documentElement
    const ro = new ResizeObserver(() => {
      const h = rowRef.current?.offsetHeight || 72
      root.style.setProperty('--composer-h', `${h}px`)
    })
    rowRef.current && ro.observe(rowRef.current)
    return () => { ro.disconnect(); root.style.removeProperty('--composer-h') }
  }, [])

  // Lift above mobile keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const onVV = () => {
      const overlap = Math.max(0, (window.innerHeight - vv.height - vv.offsetTop))
      root.style.setProperty('--kb-safe', overlap + 'px')
    }
    onVV()
    vv.addEventListener('resize', onVV)
    vv.addEventListener('scroll', onVV)
    return () => {
      vv.removeEventListener('resize', onVV)
      vv.removeEventListener('scroll', onVV)
      root.style.removeProperty('--kb-safe')
    }
  }, [])

  return (
    <div className="composer">
      {/* The only painted row (wrapper is paintless) */}
      <div ref={rowRef} className="composer-row">
        <textarea
          ref={taRef}
          className="textarea"
          placeholder="Type a message..."
          value={value}
          onChange={e=>setValue(e.target.value)}
          onKeyDown={key}
        />

        <div className="controls">
          {busy ? (
            <button className="action-btn cancel" onClick={onCancel} title="Cancel">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          ) : (
            <button
              className={`send-pill${hasText ? ' active' : ''}`}
              onClick={onSend}
              disabled={!hasText}
              title="Send"
              aria-label="Send"
            >
              {/* Blue rounded-square with WHITE right triangle */}
              <svg viewBox="0 0 48 42" aria-hidden="true">
                <rect x="0" y="0" width="48" height="42" rx="14" ry="14" className="pill-bg"/>
                <polygon points="20,11 20,31 34,21" className="pill-arrow"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
