import React from 'react';
import Button from '../../../components/ui/Button.jsx';

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
        <div className="confirm-actions" role="group" aria-label="Confirmation actions">
          <Button
            id="confirmCancel"
            className="confirm-action-btn"
            variant={null}
            material="solid"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            id="confirmOk"
            className={`confirm-action-btn${confirmDanger ? ' confirm-action-danger' : ''}`}
            variant={null}
            material={confirmDanger ? 'danger' : 'brand'}
            onClick={onConfirm}
          >
            {confirmOkLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
