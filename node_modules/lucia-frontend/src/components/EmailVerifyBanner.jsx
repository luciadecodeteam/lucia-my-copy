// lucia-secure/frontend/src/components/EmailVerifyBanner.jsx
import React from "react"
import { auth } from "../firebase"

const SUPPORT_EMAIL = "lucia.decode@proton.me"

export default function EmailVerifyBanner() {
  const user = auth.currentUser

  if (!user || user.emailVerified) return null

  return (
    <div className="limit-banner" style={{borderColor:"var(--primary)"}}>
      <div>
        <div className="title">Please verify your email</div>
        <div className="desc">
          We sent a welcome email from hello@luciadecode.com with your verification link. Check Inbox, Spam, or Promotions.
        </div>
        <div style={{opacity:.9, marginTop:6}}>
          Need another? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </div>
      </div>
    </div>
  )
}
