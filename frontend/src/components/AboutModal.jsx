import React from 'react';
import '../styles/aboutModal.css';

const Hexagon = () => (
  <svg className="hexagon-deco" viewBox="0 0 100 86.6">
    <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" />
  </svg>
);

export default function AboutModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="about-modal-overlay" onClick={onClose}>
      <div className="about-modal-scroll-container">
        <div className="about-modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="about-modal-close-btn" onClick={onClose} title="Close">
            &times;
          </button>
          
          <Hexagon />
          <Hexagon />
          <Hexagon />
          <Hexagon />

          <header className="about-modal-header">
            <h2>About Lucia</h2>
            <p>A different kind of analysis</p>
          </header>

          <section className="about-section">
            <div className="about-image-placeholder left"></div>
            <div className="about-text-content">
              <h3>What Lucia does differently</h3>
              <ul>
                <li>Lucia compares your situation with thousands of real situations and patterns.</li>
                <li>She has no ego, no agenda, and no need to please or compete with you.</li>
                <li>Her analysis stays consistent over time: if nothing changes, neither does the reading.</li>
              </ul>
            </div>
          </section>

          <section className="about-section">
            <div className="about-text-content">
              <h3>What you actually get (no magic)</h3>
              <ul>
                <li>Lucia helps you see whether what you want is possible or not — and why.</li>
                <li>If it is, she shows what improves your chances; if it isn't, how to reduce losses.</li>
                <li>She doesn't predict the future or offer absolute truth — she gives clear, usable context.</li>
              </ul>
            </div>
            <div className="about-image-placeholder right"></div>
          </section>

          <section className="about-section">
            <div className="about-image-placeholder left"></div>
            <div className="about-text-content">
              <h3>Why things don't add up</h3>
              <ul>
                <li>You read important situations with incomplete information.</li>
                <li>You project your own motives onto others, but they don't think or want the same things.</li>
                <li>Even people close to you speak from their values, limits, comparisons, and interests.</li>
              </ul>
            </div>
          </section>

          <section className="about-section privacy-note-section">
            <div className="about-text-content">
              <h4>Privacy note (small, fixed, with asterisk)</h4>
              <p>
                What you write in Lucia is not used to expose you or build personal profiles.*<br/>
                It's processed only to provide context and a response.<br/>
                <em>*Technical details explained separately.</em>
              </p>
            </div>
             <div className="about-image-placeholder right"></div>
          </section>

          <footer className="about-modal-footer">
            Lucia Decode
          </footer>
        </div>
      </div>
    </div>
  );
}
