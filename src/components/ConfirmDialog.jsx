import React from 'react';
import GlassActionPill from './GlassActionPill.jsx';

/**
 * ConfirmDialog — shared modal confirmation dialog.
 *
 * Props:
 *   confirmScrimVisible, confirmVisible  — visibility flags
 *   confirmMsg                           — message text (supports \n)
 *   confirmOkLabel                       — OK button label
 *   confirmDanger                        — styles OK button as destructive when true
 *   cancelLabel                          — cancel button label (default: 'Cancel')
 *   onConfirm()                          — called when OK is clicked
 *   onCancel()                           — called when Cancel or scrim is clicked
 */
export default function ConfirmDialog({
  confirmScrimVisible,
  confirmVisible,
  confirmMsg,
  confirmOkLabel,
  confirmDanger,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  return (
    <>
      <div
        className={`confirm-scrim${confirmScrimVisible ? ' visible' : ''}`}
        id="confirmScrim"
        onClick={onCancel}
      />
      <div
        className={`confirm-dialog${confirmVisible ? ' visible' : ''}`}
        id="confirmDialog"
      >
        <p className="confirm-message" id="confirmMessage">{confirmMsg}</p>
        <GlassActionPill
          className="confirm-actions"
          ariaLabel="Confirmation actions"
          actions={[
            {
              id: 'confirmCancel',
              label: cancelLabel,
              variant: 'secondary',
              onClick: onCancel,
            },
            {
              id: 'confirmOk',
              label: confirmOkLabel,
              variant: confirmDanger ? 'danger' : 'primary',
              onClick: onConfirm,
            },
          ]}
        />
      </div>
    </>
  );
}
