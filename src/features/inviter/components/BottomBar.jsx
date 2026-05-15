import React from 'react';
import RetakeCameraBottomBar from '../../editor/components/RetakeCameraBottomBar.jsx';

export default function BottomBar({
  visible,
  out,
  onGalleryClick,
  onProceed,
  showGallery = true,
  showProceed = true,
}) {
  return (
    <RetakeCameraBottomBar
      visible={visible}
      out={out}
      className="retake-camera-bottom-bar--split-actions s6-bottom-bar"
      glassControls
      hideTitle
      review={false}
      leftIcon="photo"
      leftLabel="Change photo"
      onLeft={onGalleryClick}
      showLeft={showGallery}
      showSecondary={false}
      showPrimary={showProceed}
      primaryIcon={null}
      primaryLabel="Next"
      primaryText="Next"
      onPrimary={onProceed}
    />
  );
}
