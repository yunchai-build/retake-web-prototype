import React from 'react';

export default function StickerEmptyState({ onGetStarted }) {
  return (
    <div className="sp-empty">
      <div className="sp-empty-stack">
        <div className="sp-empty-blob" aria-hidden="true" />
        <div className="sp-empty-copy">
          <p className="sp-empty-title">Turn any photo into a sticker.</p>
          <p className="sp-empty-sub">Or paste one you copied — here, or right on the canvas.</p>
        </div>
        <button
          type="button"
          className="sp-get-started"
          id="btnStickerGetStarted"
          onClick={onGetStarted}
        >
          Make Sticker
        </button>
      </div>
    </div>
  );
}
