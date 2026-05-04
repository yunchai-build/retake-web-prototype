import React from 'react';

export default function Toast({ visible, children, className = '', ...props }) {
  const classes = [
    'toast',
    visible ? 'visible' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" {...props}>
      {children}
    </div>
  );
}
