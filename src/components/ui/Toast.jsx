import React from 'react';

export default function Toast({ visible, children, className = '', ...props }) {
  return (
    <div className={`s6-toast${visible ? ' visible' : ''} ${className}`.trim()} role="status" {...props}>
      {children}
    </div>
  );
}
