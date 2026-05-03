import React from 'react';

export default function GlassActionPill({
  hint,
  actions,
  className = '',
  pillClassName = '',
  ariaLabel,
}) {
  const rootClass = ['glass-action', className].filter(Boolean).join(' ');
  const pillClass = ['glass-action-pill', pillClassName].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {hint && <span className="glass-action-hint">{hint}</span>}
      <div className={pillClass} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>
        {actions.map((action, index) => {
          const {
            label,
            busyLabel,
            busy = false,
            variant = 'primary',
            shape,
            className: actionClassName = '',
            buttonRef,
            key: actionKey,
            ...buttonProps
          } = action;
          const buttonClass = [
            'glass-action-btn',
            `glass-action-btn-${variant}`,
            shape ? `glass-action-btn-${shape}` : '',
            actionClassName,
          ].filter(Boolean).join(' ');

          return (
            <button
              key={actionKey || action.id || `${variant}-${index}`}
              type="button"
              {...buttonProps}
              ref={buttonRef}
              className={buttonClass}
              data-busy={busy ? 'true' : undefined}
            >
              {busy && busyLabel ? busyLabel : label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
