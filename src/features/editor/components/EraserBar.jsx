import React from 'react';
import Button from '../../../components/ui/Button.jsx';
import GlassSurface from '../../../components/ui/GlassSurface.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';
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
            <div className="magic-step">
              <span className="magic-action-hint">Draw a boundary around your subject</span>
              <GlassSurface className="magic-action-row" role="group" aria-label="Magic erase selection actions">
                <SolidIconButton
                  className="magic-back-btn"
                  icon="arrowLeft"
                  label="Back"
                  onClick={onMagicBack}
                />
                <Button
                  className="magic-confirm-btn"
                  variant={null}
                  material="solid-yellow"
                  disabled={magicConfirmDisabled || magicDetecting}
                  onClick={onMagicConfirm}
                >
                  {magicDetecting ? 'Detecting...' : 'Confirm'}
                </Button>
              </GlassSurface>
            </div>
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
