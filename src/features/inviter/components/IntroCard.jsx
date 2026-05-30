import React from 'react';

export default function IntroCard({ visible, onStartBlank, onOpenSavedFrames }) {
  return (
    <div className={`invite-card${visible ? ' visible' : ''}`} id="introCard">
      <div className="card-content">
        <div className="card-text">
          <span className="card-username">Start with</span>
          <span className="card-subtitle">a frame.</span>
        </div>
        <div className="card-buttons intro-actions">
          <button className="btn btn-primary intro-action-btn" id="btnStartBlank" onClick={onStartBlank}>
            <svg className="intro-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="3" />
              <path d="M8 8h8" />
              <path d="M8 12h8" />
              <path d="M8 16h5" />
            </svg>
            Blank canvas
          </button>
          <button className="btn btn-secondary intro-action-btn" id="btnSavedFrames" onClick={onOpenSavedFrames}>
            <svg className="intro-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M7 9h10" />
              <path d="M7 13h6" />
            </svg>
            Saved frames
          </button>
        </div>
      </div>
    </div>
  );
}
