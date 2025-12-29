// lucia-secure/frontend/src/components/StatusBar.jsx
import React, { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuthToken } from '../hooks/useAuthToken'
import { db } from '../firebase'
import "../styles/usage-indicator.css"
import { coerceNumber, resolveUsageLimits } from "../lib/usageLimits"

export default function StatusBar(){
  const { user } = useAuthToken()
  const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
  const [apiOk, setApiOk] = useState(null)
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/`, { method: 'GET' })
      .then(r => !cancelled && setApiOk(r.ok))
      .catch(() => !cancelled && setApiOk(false))
    return () => { cancelled = true }
  }, [BASE])

  useEffect(() => {
    if (!user?.uid) { setRemaining(null); return }
    const ref = doc(db, 'users', user.uid)
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const limits = resolveUsageLimits(data)

      if (limits.unlimited) {
        setRemaining(null)
        return
      }

      const used = coerceNumber(data.exchanges_used) ?? 0
      const limit = limits.courtesyAllowance && limits.courtesyUsed
        ? limits.courtesyAllowance
        : limits.baseAllowance

      if (!Number.isFinite(limit)) {
        setRemaining(null)
        return
      }

      setRemaining(Math.max(0, limit - used))
    })
    return () => unsubscribe()
  }, [user?.uid])

  let state = "usage-indicator--bad"
  if (remaining === null) {
    state = "usage-indicator--ok" // pro = unlimited
  } else if (remaining > 2) {
    state = "usage-indicator--ok"
  } else if (remaining > 0) {
    state = "usage-indicator--warn"
  }

  return (
    <div className="status">
      <span className="dot" style={{background: apiOk ? '#19C37D' : '#E74C3C'}}/> <span>API</span>
      <span style={{marginLeft:12}}/>
      <span className="dot" style={{background: user ? '#19C37D' : '#E74C3C'}}/> <span>Auth</span>
      {remaining !== null && (
        <>
          <span style={{marginLeft:12}}/>
          <div className={`usage-indicator usage-indicator--sm ${state}`}>
            <span className="usage-indicator__dot"></span>
            <span className="usage-indicator__count">{remaining}</span>
            <span className="usage-indicator__label">messages left</span>
          </div>
        </>
      )}
    </div>
  )
}
