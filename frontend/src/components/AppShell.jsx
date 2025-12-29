import React, { useState } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import StatusBar from './StatusBar';
import Sidebar from './Sidebar';

function AppShell({ children }) {
  // keep hook for future use; top-right header remains blank per spec
  const { user } = useAuthToken();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="header">
        <button className="btn sidebar-toggle" onClick={() => setOpen(s => !s)}>☰</button>
        <div className="brand">
          <img src="/images/lucia-logo.svg" alt="Lucía" />
        <div className="brand-title">LUCIA <span className="dot"/></div>
        </div>
        <div className="header-actions">{/* intentionally empty */}</div>
      </header>

      <div className="layout">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="main">
          <div className="top-strip"><StatusBar/></div>
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
