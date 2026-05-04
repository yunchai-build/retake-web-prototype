import React from 'react';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';

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
        <SolidIconButton className="s6-circle-btn" id="btnGallery" icon="photo" label="Change photo"
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

        <SolidIconButton className="s6-send-btn" id="btnProceed" icon="arrowRight" label="Proceed"
          onClick={onProceed} />
      </GlassSurface>
    </>
  );
}
