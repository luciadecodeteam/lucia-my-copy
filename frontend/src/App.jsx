// frontend/src/App.jsx
import React, { useEffect, useState } from 'react';
import './styles/tokens.css';
import './styles/app.css';
import './styles/limit.css';
import "./styles/typing.css";
import AppShell from './components/AppShell';
import ChatPage from './pages/ChatPage';
import { CheckoutCancel, CheckoutSuccess } from './pages/CheckoutResult';
import { auth, db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import FiscalGate from './components/FiscalGate';
import Pricing from './pages/Pricing';

export default function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (pathname.startsWith('/success')) {
    return <CheckoutSuccess />;
  }
  if (pathname.startsWith('/cancel')) {
    return <CheckoutCancel />;
  }

  const [needsFiscal, setNeedsFiscal] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  // lightweight page switch for overlay pages (e.g., ?page=pricing)
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get('page'));

  useEffect(() => {
    const off = auth.onAuthStateChanged((u) => {
      setAuthReady(true);
      if (!u) { setNeedsFiscal(false); return; }
      const ref = doc(db, "users", u.uid);
      const unsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) { setNeedsFiscal(true); return; }
        const d = snap.data() || {};
        setNeedsFiscal(!(d.fiscalResidence && d.fiscalResidence.countryCode));
      }, () => setNeedsFiscal(true));
      return () => unsub && unsub();
    });
    return () => off();
  }, []);

  useEffect(() => {
    function handleNavigate(ev) {
      const p = ev?.detail?.page ?? new URLSearchParams(window.location.search).get('page');
      setPage(p || null);
    }
    function handlePop() {
      const p = new URLSearchParams(window.location.search).get('page');
      setPage(p || null);
    }
    window.addEventListener('lucia:navigate-page', handleNavigate);
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('lucia:navigate-page', handleNavigate);
      window.removeEventListener('popstate', handlePop);
    };
  }, []);

  function closeOverlay() {
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    window.history.pushState({}, '', url);
    setPage(null);
  }

  return (
    <AppShell>
      {authReady && auth.currentUser && needsFiscal ? (
        <FiscalGate onDone={() => setNeedsFiscal(false)} />
      ) : (
        <>
          <ChatPage />

          {/* Overlay pages (collapsing footer region) */}
          {page === 'pricing' && (
            <div className="overlay-root">
              <Pricing onClose={closeOverlay} />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
