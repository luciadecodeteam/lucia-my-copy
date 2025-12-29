// frontend/src/components/FiscalGate.jsx
import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "../firebase";
import {
  doc, getDoc, writeBatch, serverTimestamp
} from "firebase/firestore";
import countries from "../lib/countries"; // [{ code, name }, ...]

export default function FiscalGate({ onDone }) {
  const uid = auth.currentUser?.uid;
  const [search, setSearch] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showESBlock, setShowESBlock] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries.slice(0, 50);
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [search]);

  useEffect(() => {
    if (countryCode === "ES") setShowESBlock(true);
    else setShowESBlock(false);
  }, [countryCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!uid) { setError("Not signed in."); return; }
    if (!countryCode) { setError("Choose your fiscal residence."); return; }
    if (countryCode === "ES") { setShowESBlock(true); return; }
    if (!confirmed) { setError("Please confirm the checkbox."); return; }

    setBusy(true);
    try {
      const userRef = doc(db, "users", uid);
      const prevSnap = await getDoc(userRef);
      const prev = prevSnap.exists() ? (prevSnap.data().fiscalResidence || null) : null;

      const countryName = countries.find(c => c.code === countryCode)?.name || countryCode;
      const nowId = Date.now().toString();
      const auditRef = doc(db, "user_audits", uid, "fiscal_residence_log", nowId);

      const batch = writeBatch(db);

      // Create-or-merge user profile (first create is allowed only with fiscal per rules)
      batch.set(userRef, {
        // keep your defaults on first create; they won't be checked by rules
        tier: prevSnap.exists() ? prevSnap.data().tier ?? "free" : "free",
        exchanges_used: prevSnap.exists() ? (prevSnap.data().exchanges_used ?? 0) : 0,
        courtesy_used: prevSnap.exists() ? !!prevSnap.data().courtesy_used : false,
        createdAt: prevSnap.exists() ? prevSnap.data().createdAt ?? serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
        fiscalResidence: {
          countryCode,
          countryName,
          declaredAt: serverTimestamp(),
          confirmed: true,
          declaredIp: null, // will fill below if we can
        }
      }, { merge: true });

      // Optional IP capture (see section 3 below). If you add /ip, call it here.
      try {
        const ipEndpoint = import.meta.env.VITE_IP_ENDPOINT || "https://lucia-secure.arkkgraphics.workers.dev/ip";
        const ipRes = await fetch(ipEndpoint);        if (ipRes.ok) {
          const { ip } = await ipRes.json();
          batch.set(userRef, { fiscalResidence: { declaredIp: ip } }, { merge: true });
        }
      } catch {}

      // Audit row (required when fiscal changes OR initial_set)
      batch.set(auditRef, {
        prevCountryCode: prev?.countryCode ?? null,
        prevCountryName: prev?.countryName ?? null,
        newCountryCode: countryCode,
        newCountryName: countryName,
        changedAt: serverTimestamp(),
        changedByUid: uid,
        changedIp: null, // will set below if available
        reason: prev ? "user_edit" : "initial_set",
      });

      // Try to include IP in audit as well
      try {
        const ipRes2 = await fetch("/ip");
        if (ipRes2.ok) {
          const { ip } = await ipRes2.json();
          batch.set(auditRef, { changedIp: ip }, { merge: true });
        }
      } catch {}

      await batch.commit();
      onDone && onDone();
    } catch (e) {
      console.error(e);
      setError("Failed to save fiscal residence.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-overlay" role="dialog" aria-modal="true">
      <div className="login-modal">
        <h2 style={{marginTop:0}}>Fiscal residence</h2>
        <p style={{fontSize:13, opacity:.8}}>
          Select your fiscal residence to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Search country (name or ISO code)"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{marginBottom:8}}
          />

          <div style={{
            maxHeight:160, overflow:"auto", border:"1px solid var(--surface-2)",
            borderRadius:8, marginBottom:8
          }}>
            {filtered.map(c => (
              <button
                type="button"
                key={c.code}
                onClick={()=>setCountryCode(c.code)}
                className="toggle-btn"
                style={{
                  display:"block", width:"100%", textAlign:"left",
                  background: c.code===countryCode ? "var(--surface-2)" : "transparent",
                  padding:"8px 10px", borderBottom:"1px solid var(--surface-2)"
                }}
              >
                {c.name} <span style={{opacity:.6}}>({c.code})</span>
              </button>
            ))}
          </div>

          <label style={{display:"flex", gap:8, alignItems:"flex-start"}}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e=>setConfirmed(e.target.checked)}
            />
            <span><strong>I confirm this is my correct fiscal residence and I’m responsible for keeping it updated.</strong></span>
          </label>

          {error && <div className="error" style={{marginTop:8}}>{error}</div>}

          <button type="submit" disabled={busy} style={{marginTop:10}}>
            {busy ? "Saving..." : "Continue"}
          </button>
        </form>

        {/* Spain block modal */}
        {showESBlock && (
          <div className="login-overlay" role="dialog" aria-modal="true">
            <div className="login-modal">
              <h3 style={{marginTop:0}}>We’re not available in Spain</h3>
              <p>Lucía is not offered in Spain at this time. You can browse our info pages, but you can’t create an account.</p>
              <div style={{display:"flex", gap:8}}>
                <button onClick={()=>setShowESBlock(false)}>Back</button>
                <button onClick={()=>{ /* optional: sign out */ auth.signOut(); }}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
