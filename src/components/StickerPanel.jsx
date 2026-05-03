import React from 'react';
import GlassIconButton from './GlassIconButton.jsx';
import GlassActionPill from './GlassActionPill.jsx';
import StickerEmptyState from './StickerEmptyState.jsx';
import SelectionModeButtons from './SelectionModeButtons.jsx';
import StickerRefineControls from './StickerRefineControls.jsx';
import OpacitySlider from './OpacitySlider.jsx';

const SP_TABS = [
  {
    tab: 'recents', label: 'Recents',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 15" />
      </svg>
    ),
  },
  {
    tab: 'mystickers', label: 'My Stickers',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.85 0 3-.5 3-.5v-3.5s-1 .5-3 .5c-3.58 0-6.5-2.92-6.5-6.5S8.42 5.5 12 5.5c2.38 0 4.47 1.28 5.62 3.19" />
        <path d="M19 3v6h-6" />
      </svg>
    ),
  },
  {
    tab: 'emoji', label: 'Emoji',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
  },
];

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="white" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round">
    <line x1="4" y1="4" x2="18" y2="18" />
    <line x1="18" y1="4" x2="4" y2="18" />
  </svg>
);

export default function StickerPanel({ sys }) {
  const {
    stickerPanelVisible,
    newStickerVisible,
    stickerTab,
    stickerLibrary,
    spGridRef,
    spEmojiWrapRef,
    spEmojiGridRef,
    spEmojiCatsRef,
    spEmojiSearchRef,
    nsImageCanvasRef,
    nsMaskCanvasRef,
    nsLassoCanvasRef,
    nsLoadingRef,
    nsBarLassoRef,
    nsBarRefineRef,
    nsBtnConfirmRef,
    nsBtnRefineBackRef,
    nsBrushPanelRef,
    nsTrackTopRef,
    nsTrackBottomRef,
    nsBrushHandleRef,
    nsHeaderRef,
    nsOpacitySliderRef,
    nsOpacityValRef,
    nsLassoCanConfirm,
    nsPhase,
    nsSelectionMode,
    nsDetecting,
    nsRefMode,
    nsOpacity,
    stickerPhotoInputRef,
    stickerOverlayRef,
    stkTrashBinRef,
    closePanel,
    handleTabClick,
    handleStickerPhotoChange,
    closeNewStickerScreen,
    nsConfirmLasso,
    nsBackToLasso,
    nsApply,
    nsSetSelectionMode,
    nsSetRefMode,
    nsHandleOpacityInput,
  } = sys;

  const selectionHint = {
    freehand: 'Draw the sticker edge by hand',
    circle: 'Drag a circle around your sticker',
    rect: 'Drag a box around your sticker',
    magic: 'Draw around your subject for smart cutout',
  }[nsSelectionMode] || 'Draw a boundary around your subject';

  const confirmLabel = nsSelectionMode === 'magic' && nsDetecting ? 'Detecting...' : 'Confirm';
  const showMagicAction = nsSelectionMode === 'magic' && nsPhase !== 'refine';

  return (
    <>
      {/* Sticker Panel */}
      <div className={`sticker-panel${stickerPanelVisible ? ' sp-visible' : ''}`} id="stickerPanel">
        <div className="sp-header">
          <p className="sp-title">Stickers</p>
          <button className="sp-close" onClick={closePanel}>
            <CloseIcon />
          </button>
        </div>

        <div className="sp-tabs">
          {SP_TABS.map(({ tab, label, icon }) => (
            <button
              key={tab}
              className={`sp-tab${stickerTab === tab ? ' active' : ''}`}
              onClick={() => handleTabClick(tab)}
              aria-label={label}
            >
              {icon}
            </button>
          ))}
        </div>

        <div className="sp-content">
          {/* Empty */}
          <div
            style={{ display: stickerTab !== 'emoji' && stickerLibrary.length === 0 ? 'flex' : 'none' }}
          >
            <StickerEmptyState onGetStarted={() => stickerPhotoInputRef.current?.click()} />
          </div>

          {/* Grid */}
          <div
            className="sp-grid"
            ref={spGridRef}
            style={{ display: stickerTab !== 'emoji' && stickerLibrary.length > 0 ? 'grid' : 'none' }}
          />

          {/* Emoji */}
          <div
            className="sp-emoji-wrap"
            ref={spEmojiWrapRef}
            style={{ display: stickerTab === 'emoji' ? 'flex' : 'none' }}
          >
            <div className="sp-emoji-sticky">
              <input
                ref={spEmojiSearchRef}
                className="sp-emoji-search"
                type="text"
                placeholder="Search emoji..."
              />
            </div>
            <div ref={spEmojiCatsRef} className="sp-emoji-cats" />
            <div ref={spEmojiGridRef} className="sp-emoji-grid" />
          </div>
        </div>
      </div>

      {/* New Sticker Screen */}
      <div className={`new-sticker-screen${newStickerVisible ? ' ns-visible' : ''}`} id="newStickerScreen">
        <div className="ns-header" id="nsHeader" ref={nsHeaderRef}>
          <GlassIconButton
            className="ns-close-btn"
            id="btnNsClose"
            icon="close"
            label="Close"
            contained={false}
            onClick={() => closeNewStickerScreen(true)}
          />
          <p className="ns-title">New Sticker</p>
        </div>

        <div className="ns-preview-wrap" id="nsPreviewWrap">
          <div className="ns-loading" id="nsLoading" ref={nsLoadingRef}>
            <div className="ns-spinner" />
            <span className="ns-loading-txt">Detecting…</span>
          </div>
          <canvas id="nsImageCanvas" ref={nsImageCanvasRef} />
          <canvas id="nsMaskCanvas" ref={nsMaskCanvasRef} />
          <canvas id="nsLassoCanvas" ref={nsLassoCanvasRef} />
        </div>

        <button
          type="button"
          id="btnNsRefineBack"
          ref={nsBtnRefineBackRef}
          aria-label="Back to selection"
          onClick={nsBackToLasso}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </button>

        <div id="nsBrushPanel" className="glass-floaty-surface" ref={nsBrushPanelRef}>
          <div id="nsTrackTop" ref={nsTrackTopRef} />
          <div id="nsTrackBottom" ref={nsTrackBottomRef} />
          <div id="nsBrushHandle" ref={nsBrushHandleRef} />
        </div>

        <div id="nsBarArea">
          <div className="ns-bar ns-bar-col" id="nsBarLasso" ref={nsBarLassoRef} style={{ display: 'none' }}>
            {showMagicAction ? (
              <GlassActionPill
                className="ns-lasso-action"
                pillClassName="glass-floaty-surface glass-tool-pill"
                hint={selectionHint}
                ariaLabel="New sticker selection actions"
                actions={[
                  {
                    id: 'btnNsLassoBack',
                    label: (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    ),
                    variant: 'secondary',
                    shape: 'circle',
                    'aria-label': 'Back',
                    onClick: () => nsSetSelectionMode('freehand'),
                  },
                  {
                    id: 'btnNsConfirm',
                    label: confirmLabel,
                    variant: 'primary',
                    buttonRef: nsBtnConfirmRef,
                    disabled: !nsLassoCanConfirm || nsPhase === 'detecting',
                    onClick: nsConfirmLasso,
                  },
                ]}
              />
            ) : (
              <>
                <span className="sticker-maker-hint">{selectionHint}</span>
                <div className="sticker-maker-pill glass-floaty-surface glass-tool-pill">
                  <SelectionModeButtons
                    mode={nsSelectionMode}
                    onModeClick={nsSetSelectionMode}
                  />
                  <div className="tm-divider" />
                  <OpacitySlider
                    inline
                    inputId="nsMakerOpacitySlider"
                    valueClassName="tm-val"
                    valueLabel={`${nsOpacity}%`}
                    min="10"
                    max="100"
                    value={nsOpacity}
                    style={{ '--fill': `${nsOpacity}%` }}
                    onInput={nsHandleOpacityInput}
                    onChange={nsHandleOpacityInput}
                  />
                </div>
              </>
            )}
          </div>

          <div className="ns-bar ns-bar-col glass-floaty-surface" id="nsBarRefine" ref={nsBarRefineRef} style={{ display: 'none' }}>
            <StickerRefineControls
              refMode={nsRefMode}
              opacity={nsOpacity}
              opacitySliderRef={nsOpacitySliderRef}
              opacityValueRef={nsOpacityValRef}
              onRefMode={nsSetRefMode}
              onOpacityInput={nsHandleOpacityInput}
              onApply={nsApply}
            />
          </div>
        </div>
      </div>

      {/* Overlay */}
      <div id="stickerOverlay" ref={stickerOverlayRef}>
        <div id="stkTrashBin" ref={stkTrashBinRef}>🗑</div>
      </div>

      {/* File input */}
      <input
        type="file"
        id="stickerPhotoInput"
        accept="image/*"
        ref={stickerPhotoInputRef}
        onChange={handleStickerPhotoChange}
        style={{ display: 'none' }}
      />
    </>
  );
}
