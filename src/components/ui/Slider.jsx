import React from 'react';

export default function Slider({
  label,
  className = '',
  valueLabel,
  children,
  ...props
}) {
  return (
    <div className={`ui-slider ${className}`.trim()}>
      {label ? <span className="ui-slider-label">{label}</span> : null}
      <input type="range" aria-label={label} {...props} />
      {valueLabel ? <span className="ui-slider-value">{valueLabel}</span> : null}
      {children}
    </div>
  );
}
