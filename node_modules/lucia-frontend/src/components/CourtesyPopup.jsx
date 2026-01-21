// lucia-secure/frontend/src/components/CourtesyPopup.jsx
import React from 'react'
import '../styles/courtesy-popup.css'

export default function CourtesyPopup({ onAccept, onDecline }) {
  return (
    <div className="courtesy-overlay">
      <div className="courtesy-modal">
        <div className="courtesy-header">
          <h2 className="courtesy-title">Courtesy Messages</h2>
        </div>
        
        <div className="courtesy-content">
          <p className="courtesy-message">
            You've used your 10 free messages! As a courtesy, we're offering you 
            <strong> 2 additional messages</strong> to continue your conversation with Lucía.
          </p>
          
          <div className="courtesy-stats">
            <div className="courtesy-stat">
              <span className="courtesy-stat-number">10</span>
              <span className="courtesy-stat-label">Messages Used</span>
            </div>
            <div className="courtesy-stat courtesy-stat--bonus">
              <span className="courtesy-stat-number">+2</span>
              <span className="courtesy-stat-label">Courtesy Messages</span>
            </div>
          </div>
        </div>
        
        <div className="courtesy-actions">
          <button 
            className="courtesy-btn courtesy-btn--secondary" 
            onClick={onDecline}
            type="button"
          >
            No thanks
          </button>
          <button 
            className="courtesy-btn courtesy-btn--primary" 
            onClick={onAccept}
            type="button"
          >
            Accept courtesy messages
          </button>
        </div>
        
        <div className="courtesy-footer">
          <p>After these 2 messages, you'll need to upgrade to continue.</p>
        </div>
      </div>
    </div>
  )
}
