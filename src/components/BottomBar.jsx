import React from 'react';
import GlassIconButton from './GlassIconButton.jsx';
import GlassSurface from './GlassSurface.jsx';

export default function BottomBar({
  visible,
  out,
  frameName,
  galleryInputRef,
  onGalleryChange,
  onGalleryClick,
  onEditName,
  onProceed,
}) {
  return (
    <>
      <input type="file" id="galleryInput" ref={galleryInputRef} accept="image/*"
        style={{ display: 'none' }} onChange={onGalleryChange} />
      <GlassSurface id="s6BottomBar" className={`s6-bottom-bar${visible ? ' visible' : ''}${out ? ' out' : ''}`}>
        <GlassIconButton className="s6-circle-btn" id="btnGallery" icon="photo" label="Change photo"
          onClick={onGalleryClick} />

        <button
          type="button"
          className="s6-frame-title-btn"
          id="frameNameDisplay"
          aria-label="Name your frame"
          onClick={onEditName}
        >
          <span className="s6-frame-title-text">{frameName}</span>
        </button>

        <GlassIconButton className="s6-send-btn" id="btnProceed" icon="arrowRight" label="Proceed"
          onClick={onProceed} />
      </GlassSurface>
    </>
  );
}
