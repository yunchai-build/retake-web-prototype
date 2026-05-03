import React from 'react';
import OpacitySlider from './OpacitySlider.jsx';

export default function StickerRefineControls({
  refMode,
  opacity,
  opacitySliderRef,
  opacityValueRef,
  onRefMode,
  onOpacityInput,
  onApply,
}) {
  return (
    <>
      <div className="magic-toggle">
        <button
          type="button"
          className={`magic-toggle-btn${refMode === 'pen' ? ' on' : ''}`}
          id="btnNsMark"
          onClick={() => onRefMode('pen')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round">
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="4" y1="12" x2="20" y2="12" />
          </svg>
          Mark
        </button>
        <button
          type="button"
          className={`magic-toggle-btn${refMode === 'erase' ? ' on' : ''}`}
          id="btnNsClear"
          onClick={() => onRefMode('erase')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round">
            <line x1="4" y1="12" x2="20" y2="12" />
          </svg>
          Clear
        </button>
      </div>
      <OpacitySlider
        className="magic-opacity-row"
        inputId="nsOpacitySlider"
        inputRef={opacitySliderRef}
        valueId="nsOpacityVal"
        valueRef={opacityValueRef}
        valueLabel={`${opacity}%`}
        min="10"
        max="100"
        value={opacity}
        style={{ flex: 1, '--fill': `${opacity}%` }}
        onInput={onOpacityInput}
        onChange={onOpacityInput}
      />
      <button type="button" className="ns-pri" id="btnNsApply" onClick={onApply}>
        Add Sticker
      </button>
    </>
  );
}
