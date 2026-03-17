import React from 'react';
import '../styles/aboutModal.css'; // Reusing some overlay styles

export default function VideoModal({ open, onClose, title, videoId }) {
  if (!open) return null;

  return (
    <div className="about-modal-overlay" onClick={onClose}>
      <div className="about-modal-scroll-container">
        <div 
          className="about-modal-content video-modal-content" 
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '400px', width: '90%' }}
        >
          <button className="about-modal-close-btn" onClick={onClose} title="Close">
            &times;
          </button>
          
          <header className="about-modal-header">
            <h2>{title}</h2>
          </header>

          <div className="video-container" style={{ position: 'relative', paddingBottom: '177.78%', height: 0, overflow: 'hidden', marginTop: '20px', borderRadius: '12px' }}>
            <iframe
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              src={`https://www.youtube.com/embed/${videoId}`}
              title={title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>

          <footer className="about-modal-footer" style={{ marginTop: '20px' }}>
            L.U.C.I.A DECODE
          </footer>
        </div>
      </div>
    </div>
  );
}
