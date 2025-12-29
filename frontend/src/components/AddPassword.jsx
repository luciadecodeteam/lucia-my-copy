// AddPassword.jsx (drop in components/)
import React, { useState } from "react"
import { auth } from "../firebase"
import { EmailAuthProvider, linkWithCredential } from "firebase/auth"

export default function AddPassword({ onDone }) {
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")

  async function linkPassword(e){
    e.preventDefault()
    setLoading(true); setErr(""); setMsg("")
    try {
      const user = auth.currentUser
      if (!user?.email) { setErr("No signed-in user email."); return }
      const cred = EmailAuthProvider.credential(user.email, pw)
      await linkWithCredential(user, cred)
      setMsg("Password added. You can now log in with email/password.")
      onDone && onDone()
    } catch (e) {
      if (e.code === "auth/credential-already-in-use") setErr("This email already has a password.")
      else if (e.code === "auth/requires-recent-login") setErr("Please re-authenticate, then try again.")
      else setErr(e.message || "Failed to add password.")
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={linkPassword} style={{display:"flex",gap:8,alignItems:"center"}}>
      <input type="password" placeholder="New password (min 6)" value={pw} onChange={e=>setPw(e.target.value)} required />
      <button type="submit" disabled={loading}>{loading?"…":"Add password"}</button>
      {msg && <span style={{opacity:.8}}>{msg}</span>}
      {err && <span style={{color:"var(--core)"}}>{err}</span>}
    </form>
  )
}
