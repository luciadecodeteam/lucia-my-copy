import React from 'react';
import '../styles/aboutModal.css';

const Hexagon = () => (
  <svg className="hexagon-deco" viewBox="0 0 100 86.6">
    <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" />
  </svg>
);

export default function AboutModal({ open, onClose }) {
  if (!open) return null;
//hi
  const navigateToPrivacy = (e) => {
    e.stopPropagation(); // Prevent the modal from closing
    onClose(); // Close the AboutModal
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'privacy');
    window.history.pushState({}, '', url);
    window.dispatchEvent(new CustomEvent('lucia:navigate-page', { detail: { page: 'privacy' } }));
  };

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
            <h2>About L.U.C.I.A</h2>
            <p>A different kind of analysis</p>
          </header>

          <section className="about-section">
            <img src="/images/Image 1.png" alt="Abstract representation of situational patterns" className="about-image left" />
            <div className="about-text-content">
              <h3>What L.U.C.I.A does differently</h3>
              <ul>
                <li>L.U.C.I.A compares your situation with thousands of real situations and patterns.</li>
                <li>She has no ego, no agenda, and no need to please or compete with you.</li>
                <li>Her analysis stays consistent over time: if nothing changes, neither does the reading.</li>
              </ul>
            </div>
          </section>

          <section className="about-section">
            <div className="about-text-content">
              <h3>What you actually get (no magic)</h3>
              <ul>
                <li>L.U.C.I.A helps you see whether what you want is possible or not — and why.</li>
                <li>If it is, she shows what improves your chances; if it isn't, how to reduce losses.</li>
                <li>She doesn't predict the future or offer absolute truth — she gives clear, usable context.</li>
              </ul>
            </div>
            <img src="/images/Image 2.png" alt="Visual metaphor for gaining clarity and context" className="about-image right" />
          </section>

          <section className="about-section">
            <img src="/images/Image 3.png" alt="Illustration of incomplete information and projection" className="about-image left" />
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
              <h4>Privacy note</h4>
              <p>
                What you write in L.U.C.I.A is not used to expose you or build personal profiles.*<br/>
                It's processed only to provide context and a response.<br/>
                <em>
                  *Technical details explained in our{' '}
                  <a href="#" onClick={navigateToPrivacy} className="privacy-link">Privacy Policy</a>.
                </em>
              </p>
            </div>
             <img src="/images/Image 4.png" alt="Symbol of digital privacy and data protection" className="about-image right" />
          </section>

          <section className="about-section legal-disclaimer-section">
            <div className="about-text-content">
              <h4>Important Disclaimers</h4>
              <p>
                L.U.C.I.A. is currently in her initial launch phase. Please note that during this phase, L.U.C.I.A. is not available to users in the EU. Additionally, because our system relies on underlying AI models, if the current model is deprecated or reaches end-of-support, we may temporarily suspend service until a replacement is integrated. Should the operational costs of these underlying services increase substantially, subscription pricing may be adjusted accordingly to maintain the platform.
              </p>
            </div>
          </section>

          <footer className="about-modal-footer">
            L.U.C.I.A DECODE
          </footer>
        </div>
      </div>
    </div>
  );
}
