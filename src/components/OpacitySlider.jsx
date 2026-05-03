import React from 'react';

function OpacityIcon({ className = '' }) {
  return (
    <span className={`opacity-slider-icon ${className}`.trim()} aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 1 0 0 20V2z" fill="currentColor" />
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

export default function OpacitySlider({
  className = '',
  inline = false,
  inputId,
  inputRef,
  valueId,
  valueRef,
  valueClassName = 'magic-tol-val',
  valueLabel,
  min = 10,
  max = 100,
  value,
  defaultValue,
  disabled = false,
  style,
  onInput,
  onChange,
}) {
  const content = (
    <>
      <OpacityIcon />
      <input
        type="range"
        id={inputId}
        ref={inputRef}
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        style={style}
        onInput={onInput}
        onChange={onChange}
        aria-label="Opacity"
      />
      <span className={`opacity-slider-value ${valueClassName}`.trim()} id={valueId} ref={valueRef}>
        {valueLabel}
      </span>
    </>
  );

  if (inline) return content;
  return <div className={`opacity-slider ${className}`.trim()}>{content}</div>;
}
