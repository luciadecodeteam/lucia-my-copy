import React, { useState } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import StatusBar from './StatusBar';
import Sidebar from './Sidebar';
import VideoModal from './VideoModal';
import AboutModal from './AboutModal';

function AppShell({ children }) {
  // keep hook for future use; top-right header remains blank per spec
  const { user } = useAuthToken();
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [howToUseOpen, setHowToUseOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="header">
        <button className="btn sidebar-toggle" onClick={() => setOpen(s => !s)}>☰</button>
        <div className="brand">
          <img src="/images/lucia-logo.svg" alt="L.U.C.I.A." />
          <div className="brand-title">L.U.C.I.A. <span className="dot"/></div>
        </div>
        <div className="header-actions">
          <button className="btn ghost nav-link" onClick={() => setHowToUseOpen(true)}>How to use</button>
          <button className="btn ghost nav-link" onClick={() => setAboutOpen(true)}>About L.U.C.I.A.</button>
        </div>
      </header>

      <div className="layout">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="main">
          <div className="top-strip"><StatusBar/></div>
          {children}
        </main>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <VideoModal 
        open={howToUseOpen} 
        onClose={() => setHowToUseOpen(false)} 
        title="How to use L.U.C.I.A." 
        videoId="NxNkr6fGnDM" // Updated Tutorial Video ID
      />
    </div>
  );
}

export default AppShell;

