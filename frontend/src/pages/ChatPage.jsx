// lucia-secure/frontend/src/pages/ChatPage.jsx
import React, { useState, useEffect, useMemo } from "react"
import MessageBubble from "../components/MessageBubble"
import Composer from "../components/Composer"
import CourtesyPopup from "../components/CourtesyPopup"
import { onQuickPrompt } from "../lib/bus"
import { useAuthToken } from "../hooks/useAuthToken"
import { chatUrl, getIdToken, fetchChatCompletion } from "../lib/api"
import {
  auth,
  db,
  ensureUser,
  getUserData,
  createConversation,
  listenMessages,
  addMessage,
  bumpUpdatedAt,
  setConversationTitle
} from "../firebase"
import LoginForm from "../components/LoginForm"
import EmailVerifyBanner from "../components/EmailVerifyBanner"
import LegalPages from "../components/LegalPages"   

// styles
import "../styles/limit.css"
import "../styles/typing.css"
import "../styles/thread-loading.css"
import "../styles/lucia-listening.css"
import "../styles/usage-indicator.css"
import "../styles/chat-layout.css"
import "../styles/login.css"
import "../styles/courtesy-popup.css"

import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth"
import { doc, onSnapshot, getDoc, runTransaction } from "firebase/firestore"
import { resolveUsageLimits, resolveTier, canonicalizeTier, coerceBoolean, coerceNumber } from "../lib/usageLimits"

const CHAT_URL = chatUrl()
const DEFAULT_SYSTEM =
  "L.U.C.I.A. – Logical Understanding & Clarification of Interpersonal Agendas. She tells you what they want, what they're hiding, and what will actually work. Her value is context and strategy, not therapy. You are responsible for decisions."

/* ------------------------------ DATA HARDENING ------------------------------ */
async function normalizeUserDoc(uid) {
  const ref = doc(db, "users", uid)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const cur = snap.data() || {}
    const next = {}

    const canonicalTier = resolveTier(cur)
    if (canonicalTier && canonicalTier !== canonicalizeTier(cur.tier)) {
      next.tier = canonicalTier
    } else if (typeof cur.tier !== "string") {
      next.tier = String(cur.tier ?? "free")
    }

    if (typeof cur.exchanges_used !== "number") {
      const n = Number(cur.exchanges_used ?? 0)
      next.exchanges_used = Number.isFinite(n) ? n : 0
    }

    if (typeof cur.courtesy_used !== "boolean") {
      next.courtesy_used = coerceBoolean(cur.courtesy_used)
    }

    if (Object.keys(next).length > 0) tx.update(ref, next)
  })
}

/* ------------------------------ COURTESY ACCEPT ----------------------------- */
async function acceptCourtesy(uid) {
  const ref = doc(db, "users", uid)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error("User doc missing")
    const cur = snap.data() || {}
    const limits = resolveUsageLimits(cur)
    const used = coerceNumber(cur.exchanges_used) ?? 0
    const base = limits.baseAllowance
    const courtesyCap = limits.courtesyAllowance
    const courtesyUsed = limits.courtesyAllowance ? limits.courtesyUsed : false

    if (!Number.isFinite(base) || !Number.isFinite(courtesyCap) || courtesyCap <= base) {
      throw new Error("Courtesy not available")
    }

    if (!courtesyUsed && used === base) {
      tx.update(ref, { exchanges_used: base + 1, courtesy_used: true })
      return
    }

    throw new Error("Courtesy not available")
  })
}

/* --------------------------- SAFE USAGE INCREMENT --------------------------- */
async function safeIncrementUsage(uid) {
  const ref = doc(db, "users", uid)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error("User doc missing")
    const cur = snap.data() || {}
    const limits = resolveUsageLimits(cur)
    const used = coerceNumber(cur.exchanges_used) ?? 0

    if (limits.unlimited) {
      tx.update(ref, { exchanges_used: used + 1 })
      return
    }

    const base = limits.baseAllowance
    const courtesyCap = limits.courtesyAllowance
    const hasCourtesy = Number.isFinite(courtesyCap) && Number.isFinite(base) && courtesyCap > base
    const courtesyUsed = hasCourtesy ? limits.courtesyUsed : false

    if (!Number.isFinite(base)) {
      throw new Error("Usage limit misconfigured")
    }

    if (!hasCourtesy) {
      if (used >= base) {
        throw new Error("Message allowance exhausted")
      }
      tx.update(ref, { exchanges_used: used + 1 })
      return
    }

    if (!courtesyUsed) {
      if (used < base) {
        tx.update(ref, { exchanges_used: used + 1 })
        return
      }
      if (used === base) {
        tx.update(ref, { exchanges_used: base + 1, courtesy_used: true })
        return
      }
    } else if (used < courtesyCap) {
      tx.update(ref, { exchanges_used: used + 1 })
      return
    }

    throw new Error("Free limit reached")
  })
}

export default function ChatPage() {
  const { user } = useAuthToken()
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  const [profile, setProfile] = useState(null)
  const [capHit, setCapHit] = useState(false)
  const [showCourtesy, setShowCourtesy] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [system] = useState(DEFAULT_SYSTEM)
  const [conversationId, setConversationId] = useState(() => new URLSearchParams(window.location.search).get("c") || null)

  // NEW: Legal overlay state
  const getPageFromURL = () => {
    const sp = new URLSearchParams(window.location.search)
    const p = sp.get("page")
    return (p === "terms" || p === "privacy") ? p : null
  }
  const [legalPage, setLegalPage] = useState(getPageFromURL())

  useEffect(() => {
    const off = onQuickPrompt((t) => setText(String(t || "")))
    return off
  }, [])

  // Email link sign-in
  useEffect(() => {
    (async () => {
      try {
        const href = window.location.href
        if (!href) return
        if (!isSignInWithEmailLink(auth, href)) return

        let email = window.localStorage.getItem("lucia-emailForSignIn") || ""
        if (!email) email = window.prompt("Confirm your email for sign-in") || ""
        if (!email) return

        await signInWithEmailLink(auth, email, href)
        window.localStorage.removeItem("lucia-emailForSignIn")
        if (auth.currentUser?.uid) await ensureUser(auth.currentUser.uid)
        setShowLogin(false)

        const clean = new URL(window.location.origin + window.location.pathname + window.location.search)
        clean.searchParams.delete("oobCode")
        clean.searchParams.delete("mode")
        clean.searchParams.delete("apiKey")
        window.history.replaceState({}, "", clean)
      } catch (e) {
        console.error("Email link completion failed:", e)
      }
    })()
  }, [])

  // Sidebar → show login
  useEffect(() => {
    const open = () => setShowLogin(true)
    window.addEventListener("lucia:show-login", open)
    return () => window.removeEventListener("lucia:show-login", open)
  }, [])

  // Sidebar → switch chat
  useEffect(() => {
    const onSwitch = (e) => {
      const cid = e.detail?.cid
      if (!cid) return
      setMsgs([])
      setLoadingThread(true)
      setConversationId(cid)
    }
    const onPop = () => {
      const cid = new URLSearchParams(window.location.search).get("c") || null
      setMsgs([])
      setLoadingThread(true)
      setConversationId(cid)
      setLegalPage(getPageFromURL()) // NEW: also update legal overlay
    }
    window.addEventListener("lucia:switch-chat", onSwitch)
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("lucia:switch-chat", onSwitch)
      window.removeEventListener("popstate", onPop)
    }
  }, [])

  // NEW: Sidebar → legal page navigation
  useEffect(() => {
    function onNavigate(e){
      const page = e?.detail?.page
      if (page === "terms" || page === "privacy") setLegalPage(page)
    }
    window.addEventListener("lucia:navigate-page", onNavigate)
    return () => window.removeEventListener("lucia:navigate-page", onNavigate)
  }, [])

  // Live messages
  useEffect(() => {
    if (!conversationId || !user?.uid) return
    setLoadingThread(true)
    const unsub = listenMessages(user.uid, conversationId, (rows) => {
      setMsgs(rows)
      setLoadingThread(false)
    })
    return () => { setLoadingThread(true); unsub && unsub() }
  }, [conversationId, user?.uid])

  // Live profile
  useEffect(() => {
    if (!user?.uid) return
    let unsub = null
    ;(async () => {
      await ensureUser(user.uid)
      try { await normalizeUserDoc(user.uid) } catch {}
      const ref = doc(db, "users", user.uid)
      unsub = onSnapshot(ref, (snap) => setProfile(snap.exists() ? snap.data() : null))
    })()
    return () => unsub && unsub()
  }, [user?.uid])

  // Quota
  const quota = useMemo(() => {
    if (!profile) {
      return {
        unlimited: false,
        used: 0,
        base: 10,
        courtesyCap: 12,
        courtesyUsed: false,
        courtesyAvailable: true,
        total: 10,
        remaining: 10,
      }
    }

    const limits = resolveUsageLimits(profile)
    const used = coerceNumber(profile.exchanges_used) ?? 0

    if (limits.unlimited) {
      return {
        unlimited: true,
        used,
        base: Infinity,
        courtesyCap: null,
        courtesyUsed: false,
        courtesyAvailable: false,
        total: Infinity,
        remaining: Infinity,
      }
    }

    const base = Number.isFinite(limits.baseAllowance) ? limits.baseAllowance : 0
    const courtesyCap = Number.isFinite(limits.courtesyAllowance) ? limits.courtesyAllowance : null
    const courtesyAvailable = Boolean(courtesyCap && courtesyCap > base)
    const courtesyUsed = courtesyAvailable ? limits.courtesyUsed : false
    const total = courtesyAvailable && courtesyUsed ? courtesyCap : base
    const remaining = Math.max(0, total - used)

    return {
      unlimited: false,
      used,
      base,
      courtesyCap,
      courtesyUsed,
      courtesyAvailable,
      total,
      remaining,
    }
  }, [profile])

  useEffect(() => {
    if (!quota || quota.unlimited) { setShowCourtesy(false); setCapHit(false); return }

    if (quota.courtesyAvailable && !quota.courtesyUsed && quota.used === quota.base) {
      setShowCourtesy(true); setCapHit(false); return
    }

    const cap = quota.courtesyAvailable && quota.courtesyUsed ? quota.courtesyCap : quota.base
    if (Number.isFinite(cap) && quota.used >= cap) { setShowCourtesy(false); setCapHit(true); return }

    setCapHit(false)
  }, [quota])

  async function ensureLogin() {
    if (!auth.currentUser) { setShowLogin(true); throw new Error("Login required") }
    const uid = auth.currentUser.uid
    await ensureUser(uid)
    return uid
  }

  async function handleCourtesyAccept() {
    try {
      const uid = auth.currentUser?.uid
      if (!uid) return setShowLogin(true)
      await normalizeUserDoc(uid)
      await acceptCourtesy(uid)
      setShowCourtesy(false)
    } catch (e) { console.error("Courtesy accept failed:", e) }
  }
  function handleCourtesyDecline() { setShowCourtesy(false); setCapHit(true) }

async function send() {
  const content = text.trim()
  if (!content) return
  setBusy(true)
  setText("")
  try {
    const uid = await ensureLogin()
    let cid = conversationId
    if (!cid) {
      const title = content.slice(0, 48)
      cid = await createConversation(uid, title, "")
      const url = new URL(window.location.href)
      url.searchParams.set("c", cid)
      window.history.replaceState({}, "", url)
      setConversationId(cid)
    } else if (msgs.length === 0) {
      await setConversationTitle(uid, cid, content.slice(0, 48))
    }
    if (!quota.unlimited) {
      if (quota.courtesyAvailable && !quota.courtesyUsed && quota.used === quota.base) {
        setShowCourtesy(true); setBusy(false); return
      }
      const cap = quota.courtesyAvailable && quota.courtesyUsed ? quota.courtesyCap : quota.base
      if (Number.isFinite(cap) && quota.used >= cap) { setCapHit(true); setBusy(false); return }
    }
    await addMessage(uid, cid, "user", content)
    
    // FIXED: Convert messages to history format and use correct request format
    const history = msgs.map(m => ({ role: m.role, content: m.content }))
    const token = await getIdToken()

    const result = await fetchChatCompletion({
      url: CHAT_URL,
      prompt: content,
      history,
      token
    })

    if (!result.ok) {
      await addMessage(uid, cid, "system", `⚠️ ${result.reason}`)
      await bumpUpdatedAt(uid, cid)
      return
    }

    await addMessage(uid, cid, "assistant", result.content)
    await bumpUpdatedAt(uid, cid)
    if (!quota.unlimited) await safeIncrementUsage(uid)
  } catch (err) {
    if (String(err?.message || "").toLowerCase() !== "login required") console.error(err)
  } finally { setBusy(false) }
}

  function cancel() { setBusy(false) }

  const usageDisplay = useMemo(() => {
    if (!profile || quota.unlimited) return null
    const cap = quota.courtesyAvailable && quota.courtesyUsed ? quota.courtesyCap : quota.base
    if (!Number.isFinite(cap)) return null
    const current = Math.min(quota.used, cap)
    const total = cap
    return { current, total }
  }, [profile, quota])

  function closeLegal(){
    const url = new URL(window.location.href)
    url.searchParams.delete("page")
    window.history.pushState({}, "", url)
    setLegalPage(null)
  }

  return (
    <>
      {showLogin && <LoginForm onClose={() => setShowLogin(false)} onLogin={() => setShowLogin(false)} />}
      {showCourtesy && <CourtesyPopup onAccept={handleCourtesyAccept} onDecline={handleCourtesyDecline} />}
      {user && user.email && !user.emailVerified && <EmailVerifyBanner />}

      {capHit && (
        <div className="limit-banner" role="alert">
          <div>
            <div className="title">Free messages finished</div>
            <div className="desc">Upgrade to keep chatting with Lucía.</div>
          </div>
          <button className="act" type="button" disabled>Upgrade</button>
        </div>
      )}

      <div className="thread">
        {loadingThread ? (
          <div className="lucia-listening">
            <div className="lucia-spinner"></div>
            <div className="lucia-listening-text">Lucia is listening...</div>
            <div className="lucia-listening-subtext">Analyzing the conversation</div>
          </div>
        ) : msgs.length === 0 ? (
          <MessageBubble role="assistant">{DEFAULT_SYSTEM}</MessageBubble>
        ) : (
          <>
            {msgs.map((m) => (
              <MessageBubble key={m.id} role={m.role}>{m.content}</MessageBubble>
            ))}
            {busy && (
              <MessageBubble role="assistant">
                <span className="typing"><span></span><span></span><span></span></span>
              </MessageBubble>
            )}
          </>
        )}
      </div>

      <Composer value={text} setValue={setText} onSend={send} onCancel={cancel} busy={busy} />

      {usageDisplay && !capHit && !showCourtesy && (
        <div className={"usage-indicator usage-indicator--sm " +
          (quota.remaining > 2 ? "usage-indicator--ok" : quota.remaining > 0 ? "usage-indicator--warn" : "usage-indicator--bad")}>
          <span className="usage-indicator__dot"></span>
          <span className="usage-indicator__count">{usageDisplay.current}/{usageDisplay.total}</span>
          <span className="usage-indicator__label">messages used</span>
        </div>
      )}

      {/* LEGAL OVERLAY */}
      {legalPage && <LegalPages page={legalPage} onBack={closeLegal} />}
    </>
  )
}
