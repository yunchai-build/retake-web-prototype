import React, { useCallback } from 'react';
import EditSelectionPanel from '../../editor/selection/EditSelectionPanel.jsx';

export default function StickerEditorScreen({
  visible,
  imageSrc,
  onClose,
  onAddSticker,
}) {
  const handleConfirm = useCallback((result) => {
    onAddSticker?.({ src: result.src, width: result.width, height: result.height });
  }, [onAddSticker]);

  return (
    <EditSelectionPanel
      visible={visible}
      sourceSrc={imageSrc}
      initialSelection="smartSubject"
      confirmLabel="Add"
      title="Make sticker from photo"
      logPrefix="sticker-editor"
      onCancel={onClose}
      onConfirm={handleConfirm}
    />
  );
}
