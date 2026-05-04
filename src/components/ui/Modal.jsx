import React from 'react';

export default function Modal({
  visible,
  scrimVisible = visible,
  className = '',
  children,
  onScrimClick,
  ...props
}) {
  return (
    <>
      <div
        className={`confirm-scrim${scrimVisible ? ' visible' : ''}`}
        onClick={onScrimClick}
      />
      <div
        className={`confirm-dialog${visible ? ' visible' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        {...props}
      >
        {children}
      </div>
    </>
  );
}
