import React from 'react';
import GlassActionPill from './GlassActionPill.jsx';
import OpacitySlider from './OpacitySlider.jsx';
import SelectionModeButtons from './SelectionModeButtons.jsx';

export default function EraserBar({
  active,
  eraserMode,
  eraserOpacitySliderRef,
  magicPhase,
  magicConfirmDisabled,
  magicDetecting,
  magicRefMode,
  magicOpacity,
  onShapeClick,
  onOpacityInput,
  onMagicBack,
  onMagicConfirm,
  onMagicRefMode,
  onMagicOpacityInput,
  onMagicApply,
}) {
  const magicActive = eraserMode === 'magic';
  return (
    <div id="tmEraserBar" className={`${active ? 'tm-in' : ''}${magicActive ? ' magic-mode' : ''}${magicActive && magicPhase === 'lasso' ? ' magic-lasso-mode' : ''}`}>
      {!magicActive && (
        <>
          <div className="eraser-shapes">
            <SelectionModeButtons mode={eraserMode} onModeClick={onShapeClick} />
          </div>
          <div className="tm-divider"></div>
          <OpacitySlider
            inline
            inputId="eraserOpacitySlider"
            inputRef={eraserOpacitySliderRef}
            valueId="eraserOpacityVal"
            valueClassName="tm-val"
            valueLabel="100%"
            min="5"
            max="100"
            defaultValue="100"
            onInput={onOpacityInput}
          />
        </>
      )}

      {magicActive && (
        <div id="eraserMagicUI">
          {magicPhase === 'lasso' ? (
            <GlassActionPill
              className="magic-step"
              hint="Draw a boundary around your subject"
              ariaLabel="Magic erase selection actions"
              actions={[
                {
                  label: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  ),
                  variant: 'secondary',
                  shape: 'circle',
                  'aria-label': 'Back',
                  onClick: onMagicBack,
                },
                {
                  label: 'Confirm',
                  busyLabel: 'Detecting...',
                  busy: magicDetecting,
                  variant: 'primary',
                  disabled: magicConfirmDisabled || magicDetecting,
                  onClick: onMagicConfirm,
                },
              ]}
            />
          ) : (
            <div className="magic-step">
              <div className="magic-toggle">
                <button className={`magic-toggle-btn${magicRefMode === 'pen' ? ' on' : ''}`} onClick={() => onMagicRefMode('pen')}>Mark</button>
                <button className={`magic-toggle-btn${magicRefMode === 'erase' ? ' on' : ''}`} onClick={() => onMagicRefMode('erase')}>Clear</button>
              </div>
              <OpacitySlider
                className="magic-opacity-row"
                min="10"
                max="100"
                value={magicOpacity}
                valueLabel={`${magicOpacity}%`}
                onInput={onMagicOpacityInput}
                onChange={onMagicOpacityInput}
              />
              <button className="magic-apply-btn" onClick={onMagicApply}>Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
