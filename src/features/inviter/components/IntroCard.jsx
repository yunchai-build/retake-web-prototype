import React from 'react';

export default function IntroCard({ visible, onChoosePhoto, onStartBlank }) {
  return (
    <div className={`invite-card${visible ? ' visible' : ''}`} id="introCard">
      <div className="card-content">
        <div className="card-text">
          <span className="card-username">Make a frame,</span>
          <span className="card-subtitle">share it.</span>
        </div>
        <div className="card-buttons" style={{ flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn-primary btn-photo" id="btnChoosePhoto" onClick={onChoosePhoto}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-brand-yellow)' }}>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Pick a photo
          </button>
          <button className="btn btn-secondary btn-blank" id="btnStartBlank" onClick={onStartBlank}>
            Blank canvas
          </button>
        </div>
      </div>
    </div>
  );
}
