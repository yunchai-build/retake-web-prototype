import React from 'react';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import SolidIconButton from '../../../components/ui/SolidIconButton.jsx';
import SolidSurface from '../../../components/ui/SolidSurface.jsx';
import StickerEmptyState from './StickerEmptyState.jsx';
import SelectionModeButtons from './SelectionModeButtons.jsx';
import StickerRefineControls from './StickerRefineControls.jsx';
import ToolIcon from '../../../components/icons/ToolIcon.jsx';

const SP_TABS = [
  {
    tab: 'recents', label: 'Recents',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 15" />
      </svg>
    ),
  },
  {
    tab: 'mystickers', label: 'My Stickers',
    icon: <ToolIcon type="stickers" />,
  },
  {
    tab: 'emoji', label: 'Emoji',
    icon: <span className="sp-tab-emoji">😊</span>,
  },
];

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
    nsClearAllMarks,
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
  const nsCheckDisabled = nsPhase !== 'refine' && (!nsLassoCanConfirm || nsPhase === 'detecting' || nsDetecting);
  const nsCheckLabel = nsPhase === 'refine'
    ? 'Apply sticker'
    : nsPhase === 'detecting' || nsDetecting
      ? 'Detecting sticker'
      : 'Confirm sticker';
  const handleNsCheck = nsPhase === 'refine' ? nsApply : nsConfirmLasso;

  return (
    <>
      {/* Sticker Panel */}
      <div className={`sticker-panel${stickerPanelVisible ? ' sp-visible' : ''}`} id="stickerPanel">
        <div className="sp-header">
          <p className="sp-title">Stickers</p>
          <SolidIconButton className="sp-close" icon="close" label="Close stickers" onClick={closePanel} />
        </div>

        <div className="sp-tabs">
          {SP_TABS.map(({ tab, label, icon }) => {
            const active = stickerTab === tab;

            return (
              <IconButton
                key={tab}
                className="sp-tab"
                material={active ? 'solid' : 'plain'}
                variant="plain"
                active={active}
                onClick={() => handleTabClick(tab)}
                label={label}
              >
                {icon}
              </IconButton>
            );
          })}
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
          <SolidIconButton
            className="ns-close-btn"
            id="btnNsClose"
            icon="close"
            label="Close"
            onClick={() => closeNewStickerScreen(true)}
          />
          <p className="ns-title">New Sticker</p>
          <SolidIconButton
            className="ns-check-btn"
            id="btnNsCheck"
            icon="check"
            label={nsCheckLabel}
            disabled={nsCheckDisabled}
            onClick={handleNsCheck}
          />
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

        <SolidIconButton
          id="btnNsRefineBack"
          icon="arrowLeft"
          label="Back to selection"
          buttonRef={nsBtnRefineBackRef}
          onClick={nsBackToLasso}
        />

        <div id="nsBrushPanel" className="glass-floaty-surface" ref={nsBrushPanelRef}>
          <div id="nsTrackTop" ref={nsTrackTopRef} />
          <div id="nsTrackBottom" ref={nsTrackBottomRef} />
          <div id="nsBrushHandle" ref={nsBrushHandleRef} />
        </div>

        <div id="nsBarArea">
          <div className="ns-bar ns-bar-col" id="nsBarLasso" ref={nsBarLassoRef} style={{ display: 'none' }}>
            {showMagicAction ? (
              <div className="ns-lasso-action">
                <span className="ns-lasso-hint">{selectionHint}</span>
                <SolidSurface className="ns-lasso-pill" role="group" aria-label="New sticker selection actions">
                  <SolidIconButton
                    id="btnNsLassoBack"
                    className="ns-lasso-back-btn"
                    label="Back"
                    onClick={() => nsSetSelectionMode('freehand')}
                  >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                  </SolidIconButton>
                  <Button
                    id="btnNsConfirm"
                    className="ns-confirm-btn"
                    variant={null}
                    material="solid-yellow"
                    buttonRef={nsBtnConfirmRef}
                    disabled={!nsLassoCanConfirm || nsPhase === 'detecting'}
                    onClick={nsConfirmLasso}
                  >
                    {confirmLabel}
                  </Button>
                </SolidSurface>
              </div>
            ) : (
              <>
                <span className="sticker-maker-hint">{selectionHint}</span>
                {/* Stage A (mode select): only the selection-mode icons.
                    The opacity slider that used to live here had no visible
                    effect during selection (the mask doesn't exist yet) — it
                    confused users into thinking it was a contrast control.
                    It still lives in Stage B (refine) where it actually
                    controls the final sticker opacity. */}
                <div className="sticker-maker-pill glass-floaty-surface glass-tool-pill sticker-maker-stageA">
                  <SelectionModeButtons
                    className="sticker-maker-modes"
                    mode={nsSelectionMode}
                    onModeClick={nsSetSelectionMode}
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
              onClearAll={nsClearAllMarks}
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
