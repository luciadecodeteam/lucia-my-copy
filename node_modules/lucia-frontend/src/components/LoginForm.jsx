// lucia-secure/frontend/src/components/LoginForm.jsx
import React, { useEffect, useMemo, useState } from "react"
import {
  auth,
  loginWithEmail,
  registerWithEmail,
  signInWithPopup,
  googleProvider,
  ensureUser
} from "../firebase"
import {
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  sendSignInLinkToEmail
} from "firebase/auth"
import AddPassword from "./AddPassword"

const ACTION_URL = "https://luciadecode.com/"
const actionCodeSettings = { url: ACTION_URL, handleCodeInApp: true }

export default function LoginForm({ onClose, onLogin }) {
  // ONE main choice up top
  const [mode, setMode] = useState("login") // "login" | "register"
  // Passwordless is now an inline option, not a tab
  const [showLink, setShowLink] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hint, setHint] = useState("")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [methods, setMethods] = useState([])

  const [linkEmail, setLinkEmail] = useState("")
  const debugReturn = useMemo(() => ACTION_URL, [])

  // --- password strength (register) ---
  function scorePassword(pw) {
    let s = 0
    if (pw.length >= 8) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[a-z]/.test(pw)) s++
    if (/\d/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return s
  }
  const pwScore = scorePassword(password)
  const pwLabel = pwScore <= 2 ? "Weak" : pwScore === 3 ? "Okay" : "Strong"

  // Check providers for well-formed emails (prevents noisy network calls)
  useEffect(() => {
    if (showLink) return
    const trimmed = (email || "").trim()
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    if (!ok) { setMethods([]); return }
    let alive = true
    ;(async () => {
      try {
        const m = await fetchSignInMethodsForEmail(auth, trimmed)
        if (alive) setMethods(m)
      } catch {
        if (alive) setMethods([])
      }
    })()
    return () => { alive = false }
  }, [email, showLink])

  // ---- EMAIL + PASSWORD: LOGIN ----
  async function handleEmailLogin(e) {
    e.preventDefault()
    setLoading(true); setError(""); setHint("")
    try {
      const trimmed = (email || "").trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError("Enter a valid email address."); return
      }
      let providerMethods = []
      try { providerMethods = await fetchSignInMethodsForEmail(auth, trimmed) } catch { providerMethods = [] }
      if (providerMethods.includes("google.com") && !providerMethods.includes("password")) {
        setError("This email is registered with Google.")
        setHint("Tap “Continue with Google”, then add a password if you want email login.")
        return
      }
      try {
        await loginWithEmail(trimmed, password)
      } catch (err) {
        if (err?.code === "auth/user-not-found") {
          setError("No account found for this email."); setHint("Switch to Register to create one."); return
        } else if (err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password") {
          setError("Incorrect password."); setHint("Use Reset password or Continue with Google if used before."); return
        } else if (err?.code === "auth/too-many-requests") {
          setError("Too many attempts. Please wait or use Google."); return
        } else { throw err }
      }
      await ensureUser(auth.currentUser.uid)
      onLogin && onLogin()
      onClose && onClose()
    } catch (err) {
      setError("Firebase: " + (err?.message || "Unexpected error"))
    } finally { setLoading(false) }
  }

  // ---- EMAIL + PASSWORD: REGISTER ----
  async function handleEmailRegister(e) {
    e.preventDefault()
    setLoading(true); setError(""); setHint("")
    try {
      const trimmed = (email || "").trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError("Enter a valid email address."); return
      }
      let providerMethods = []
      try { providerMethods = await fetchSignInMethodsForEmail(auth, trimmed) } catch { providerMethods = [] }
      if (providerMethods.includes("password")) {
        setError("An account already exists for this email."); setHint("Switch to Log in or reset your password."); return
      }
      if (providerMethods.includes("google.com") && !providerMethods.includes("password")) {
        setError("This email is registered with Google."); setHint("Tap “Continue with Google”, then add a password in Settings."); return
      }
      if (pwScore <= 2) { setError("Password too weak. Use at least 8 chars with mix of cases, numbers, symbols."); return }

      await registerWithEmail(trimmed, password)
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        setHint("Welcome email queued - check your inbox for the verification link.")
      }
      await ensureUser(auth.currentUser.uid)
      onLogin && onLogin()
      onClose && onClose()
    } catch (err) {
      if (err?.code === "auth/email-already-in-use") setError("Email already in use. Switch to Log in.")
      else if (err?.code === "auth/weak-password") setError("Password is too weak. Try a stronger one.")
      else setError("Firebase: " + (err?.message || "Unexpected error"))
    } finally { setLoading(false) }
  }

  // ---- PASSWORD RESET ----
  async function handleResetPassword() {
    const trimmed = (email || "").trim()
    if (!trimmed) { setError("Enter your email first."); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Enter a valid email address."); return }
    setLoading(true); setError(""); setHint("")
    try {
      let providerMethods = []
      try { providerMethods = await fetchSignInMethodsForEmail(auth, trimmed) } catch { providerMethods = [] }
      if (!providerMethods.includes("password")) {
        setError("No password set for this email.")
        setHint("Use “Continue with Google”, then add a password later in Settings.")
        return
      }
      await sendPasswordResetEmail(auth, trimmed)
      setHint("Password reset email sent. Check your inbox.")
    } catch (err) {
      setError("Could not send reset email."); setHint(err?.message || "")
    } finally { setLoading(false) }
  }

  // ---- GOOGLE ----
  async function handleGoogleLogin() {
    setLoading(true); setError(""); setHint("")
    try {
      await signInWithPopup(auth, googleProvider)
      await ensureUser(auth.currentUser.uid)
      onLogin && onLogin()
      onClose && onClose()
    } catch (err) {
      setError("Google sign-in failed."); setHint(err?.message || "")
    } finally { setLoading(false) }
  }

  // When user is Google-only and typed their email, suggest adding a password
  const showAddPassword =
    !showLink &&
    auth.currentUser?.email &&
    methods.length === 1 &&
    methods[0] === "google.com" &&
    auth.currentUser.email === (email || "").trim()

  // ---- EMAIL LINK (PASSWORDLESS) ----
  async function handleEmailLink(e) {
    e.preventDefault()
    setLoading(true); setError(""); setHint("")
    try {
      const trimmed = (linkEmail || "").trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("Enter a valid email address."); return }
      localStorage.setItem("lucia-emailForSignIn", trimmed)
      await sendSignInLinkToEmail(auth, trimmed, actionCodeSettings)
      setHint(`Magic link sent to ${trimmed}. Open it on this device to finish sign-in.`)
    } catch (err) {
      setError("Failed to send link."); setHint(err?.message || "")
    } finally { setLoading(false) }
  }

  // ---------- UI ----------
  return (
    <div className="login-overlay" role="dialog" aria-modal="true">
      <div className="login-modal">
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>

        {/* Main choice: Log in vs Register (pill-style, not big blue tabs) */}
        <div className="login-main-toggle">
          <button
            className={`toggle-btn ${mode==="login"?"active":""}`}
            onClick={()=>{ setMode("login"); setShowLink(false); setError(""); setHint(""); }}
          >
            Log in
          </button>
          <button
            className={`toggle-btn ${mode==="register"?"active":""}`}
            onClick={()=>{ setMode("register"); setShowLink(false); setError(""); setHint(""); }}
          >
            Register
          </button>
        </div>

        {/* PASSWORDLESS VIEW */}
        {showLink ? (
          <>
            <h2 style={{margin:"2px 0 8px"}}>Passwordless Email Link</h2>
            <p style={{ fontSize: 13, opacity: .8, margin: "0 0 10px" }}>
              We’ll email you a one-time sign-in link. No password required.
            </p>
            <form onSubmit={handleEmailLink}>
              <input
                type="email"
                placeholder="Email (e.g., you@example.com)"
                value={linkEmail}
                onChange={e=>setLinkEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send Sign-In Link"}
              </button>
            </form>

            <button className="link-btn" onClick={()=>{ setShowLink(false); setError(""); setHint(""); }}>
              Back to {mode === "login" ? "Email Login" : "Register"}
            </button>

            <div className="divider">or</div>
            <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
              Continue with Google
            </button>
            <div className="divider">or</div>
            <button className="demo-btn" onClick={() => window.location.href = '/chat?demo=true'} disabled={loading}>
              Try a Demo
            </button>

            {(error || hint) && (
              <div className="error" style={{marginTop:10}}>
                {error && <div className="err-line">{error}</div>}
                {hint && <div className="hint-line">{hint}</div>}
              </div>
            )}

            <div style={{marginTop:10, fontSize:12, opacity:.6}}>
              Return URL: <code>{debugReturn}</code>
            </div>
          </>
        ) : (
          <>
            {/* EMAIL + PASSWORD VIEW */}
            <form onSubmit={mode==="login" ? handleEmailLogin : handleEmailRegister}>
              <input
                type="email"
                placeholder="Email (e.g., you@example.com)"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <div className="pw-wrap">
                <input
                  type={mode==="register" && showPw ? "text" : "password"}
                  placeholder={mode==="register" ? "Create a password" : "Password"}
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  required
                  autoComplete={mode==="login" ? "current-password" : "new-password"}
                />
                {mode==="register" && (
                  <button
                    type="button"
                    onClick={()=>setShowPw(p=>!p)}
                    className="pw-toggle"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                )}
              </div>

              {mode==="register" && (
                <div style={{ marginTop:6, fontSize:12 }}>
                  <div style={{height:6, background:"var(--surface-2)", borderRadius:4, overflow:"hidden"}}>
                    <div
                      style={{
                        height:"100%",
                        width: `${Math.min(100, pwScore*20)}%`,
                        background: pwScore <= 2 ? "var(--core)" : pwScore === 3 ? "var(--primary-600)" : "var(--primary)",
                        transition:"width .2s"
                      }}
                    />
                  </div>
                  <div style={{opacity:.85, marginTop:4}}>
                    Strength: <strong>{pwLabel}</strong>
                    {pwScore <= 2 && " · Use 8+ chars with upper/lowercase, numbers, and a symbol."}
                  </div>
                </div>
              )}

              <button type="submit" disabled={loading} style={{ marginTop: 10 }}>
                {loading ? "Loading..." : (mode==="login" ? "Log in with Email" : "Create Account")}
              </button>
            </form>

            {mode==="login" && (
              <div style={{display:"flex", gap:8, marginTop:8}}>
                <button className="muted-btn" onClick={handleResetPassword} disabled={loading} style={{flex:1}}>
                  Reset password
                </button>
                <button className="link-btn" onClick={()=>{ setShowLink(true); setError(""); setHint(""); }}>
                  Email Link Instead
                </button>
              </div>
            )}

            {showAddPassword && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 14, opacity: 0.8 }}>
                  You’re signed in with Google. Add a password to also log in with email/password:
                </p>
                <AddPassword onDone={() => setHint("Password added successfully.")} />
              </div>
            )}

            <div className="divider">or</div>
            <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
              Continue with Google
            </button>
            <div className="divider">or</div>
            <button className="demo-btn" onClick={() => window.location.href = '/chat?demo=true'} disabled={loading}>
              Try a Demo
            </button>

            {(error || hint) && (
              <div className="error" style={{marginTop:10}}>
                {error && <div className="err-line">{error}</div>}
                {hint && <div className="hint-line">{hint}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
