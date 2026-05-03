import React from 'react';

export default function SizeSliderRail({
  active,
  value,
  min,
  max,
  onChange,
  ariaLabel = 'Size',
  className = '',
}) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className={`size-slider-rail${active ? ' rail-active' : ''}${className ? ` ${className}` : ''}`}>
      <div className="size-slider-dot size-slider-dot-max" />
      <input
        className="size-slider-input"
        type="range"
        min={min}
        max={max}
        value={value}
        style={{ '--rail-fill': `${pct}%` }}
        aria-label={ariaLabel}
        onInput={onChange}
        onChange={onChange}
      />
      <div className="size-slider-dot size-slider-dot-min" />
    </div>
  );
}
