import React from 'react';

export default function SharePopup({ visible, shareCode, shareUrl, onCopyCode }) {
  return (
    <div className={`share-pop${visible ? ' visible' : ''}`} id="sharePop">
      <div>
        <p className="s7-pop-title">Share your frame!</p>
        <p className="s7-pop-dim">Invite a friend</p>
      </div>
      <p className="s7-pop-subtitle">Send this link — they'll open your frame, use their camera, and take a Retake.</p>
      <div className="s7-pop-code-row">
        <span className="s7-pop-code" id="shareCode">{shareUrl ? 'Link ready' : shareCode}</span>
        <button className="s7-pop-copy-btn" id="btnCopyCode" aria-label="Copy link"
          onClick={onCopyCode}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
