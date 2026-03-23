import React from 'react';
import '../styles/aboutModal.css'; // Reusing some overlay styles

export default function VideoModal({ open, onClose, title, videoId, videos }) {
  if (!open) return null;

  const videoList = videos || [{ title, videoId }];

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

          {videoList.map((video, idx) => (
            <div key={idx} style={{ marginBottom: idx === videoList.length - 1 ? 0 : '40px' }}>
              <h3 style={{ marginTop: '20px', marginBottom: '10px', fontSize: '1.1rem', color: '#fff' }}>{video.title}</h3>
              <div className="video-container" style={{ position: 'relative', paddingBottom: '177.78%', height: 0, overflow: 'hidden', borderRadius: '12px' }}>
                <iframe
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  src={`https://www.youtube.com/embed/${video.videoId}`}
                  title={video.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          ))}

          <footer className="about-modal-footer" style={{ marginTop: '20px' }}>
            L.U.C.I.A DECODE
          </footer>
        </div>
      </div>
    </div>
  );
}
