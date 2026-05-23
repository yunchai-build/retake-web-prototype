import { useRef, useState, useCallback, useEffect } from 'react';
import { TXT_FONTS } from './useTextTool';
import { polyContains } from '../utils/imageProcessing';
import { drawMagicSelectionStroke, MAGIC_SELECTION_DASH_CYCLE } from '../utils/canvas.js';
import { detectSmartSelectionMask } from '../utils/smartSelection.js';
import {
  beginTransformGesture,
  pointFromClientEvent,
  pointsFromTouchList,
  updateTransformGesture,
} from '../utils/transformGesture.js';

// ── Emoji categories ──
export const EMOJI_CATS = [
  { id: 'all',        label: 'All',         emojis: [] },
  { id: 'smileys',   label: '😄 Smileys',   emojis: ['😊','😍','🥳','🤩','😎','😘','😜','🤪','😏','🥺','😂','🤣','😭','😱','🤔','🤗','😴','🙃','😆','😅','🥹','😇','🤑','🤠','🥸','😈','🤡','👻','💀','🫠'] },
  { id: 'hearts',    label: '❤️ Hearts',    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🩷','🩵','💕','💞','💓','💗','💖','💘','💝','💔','❣️','💟'] },
  { id: 'nature',    label: '🌿 Nature',    emojis: ['🌟','✨','⚡','🔥','🌈','🌙','☀️','⭐','🌸','🍀','🦋','🌺','🌻','🌊','🍃','🌿','🌷','🌹','🌼','🌾','🍄','🪸','🌵','❄️','🌪️','🌋','🏔️'] },
  { id: 'animals',   label: '🐶 Animals',   emojis: ['🦄','🐣','🐶','🐱','🐰','🦊','🐻','🐼','🐨','🐯','🐸','🐝','🦉','🐬','🦁','🐧','🦚','🦜','🦋','🐙','🦈','🐊','🦒','🦓','🦔','🐿️','🦦','🦥','🐾','🦅'] },
  { id: 'food',      label: '🍕 Food',      emojis: ['🍓','🍒','🍑','🥭','🍋','🍊','🍇','🫐','🍭','🧁','🍕','🍔','🍜','🍦','🎂','🍩','🍪','🥑','🥝','🫒','🧇','🥞','🌮','🍣','🧋','🍵','☕','🧃','🥤','🫖'] },
  { id: 'fun',       label: '🎉 Fun',       emojis: ['🎉','🎊','🎈','🎁','🏆','👑','💎','🔑','🪄','🎯','🎸','🎨','🎭','🎪','🪩','🏄','⚽','🎮','🎲','🎰','🃏','🎠','🎡','🎢','🎷','🥁','🎤','🎬','🪅','✈️'] },
  { id: 'gestures',  label: '👋 Gestures',  emojis: ['✌️','👏','🙌','👋','🫶','💯','👍','🤘','🫰','💪','🤝','🫂','🙏','☝️','👆','🫡','🤙','👌','🤌','🤏','🖐️','🫵','🤞','🫳','🫴','🫸','🫷','🤜','🤛','🤚'] },
  { id: 'symbols',   label: '✨ Symbols',   emojis: ['✨','💫','⭐','🌟','💥','❗','❓','‼️','⁉️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','▪️','▫️','🆒'] },
];
EMOJI_CATS[0].emojis = EMOJI_CATS.slice(1).flatMap(c => c.emojis);

const EMOJI_NAMES = {
  '😊':'happy smile','😍':'love heart eyes','🥳':'party celebrate','🤩':'star struck amazing',
  '😎':'cool sunglasses','😘':'kiss love','😂':'laugh crying funny','🤣':'rolling floor laugh',
  '😭':'crying sad','❤️':'red heart love','🔥':'fire hot','✨':'sparkles stars',
  '🎉':'party celebrate confetti','🐶':'dog puppy','🐱':'cat kitten','🍕':'pizza food',
  '🎂':'birthday cake','🌸':'cherry blossom flower','🦋':'butterfly','👑':'crown king queen',
  '💎':'diamond gem','🌈':'rainbow','⚡':'lightning bolt','🌙':'moon night','☀️':'sun sunny',
};

function emojiMatchesQuery(em, q) {
  if (em.includes(q)) return true;
  return (EMOJI_NAMES[em] || '').toLowerCase().includes(q);
}

function emojiToDataURL(emoji) {
  const c = document.createElement('canvas');
  c.width = 120; c.height = 120;
  const x = c.getContext('2d');
  x.font = '90px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 60, 66);
  return c.toDataURL();
}

function wrapCanvasText(ctx, text, maxWidth) {
  return text.split('\n').flatMap(paragraph => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines = [];
    let line = '';

    words.forEach(word => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
        return;
      }
      lines.push(line);
      line = word;
    });

    if (line) lines.push(line);
    return lines;
  });
}

function stickerToTransform(stk) {
  return {
    offsetX: stk.x,
    offsetY: stk.y,
    scale: stk.scale,
    rotation: stk.rotation,
  };
}

function applyTransformToSticker(stk, transform) {
  stk.x = transform.offsetX;
  stk.y = transform.offsetY;
  stk.scale = transform.scale;
  stk.rotation = transform.rotation;
}

export function loadItemImage(item) {
  if (item.image?.complete) return Promise.resolve(item.image);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = item.src;
  });
}

export function drawTextItemToContext(ctx, item) {
  const eff  = item.fontSize * item.scale;
  const maxW = (item.wrapWidth || item.baseW) * item.scale;
  const cx   = item.x + item.baseW / 2;
  const cy   = item.y + item.baseH / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(item.rotation * Math.PI / 180);
  ctx.font         = `${item.fontStyle} ${item.fontWeight} ${eff}px ${item.fontFamily}`;
  ctx.fillStyle    = item.color;
  ctx.globalAlpha  = item.opacity ?? 1;
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur   = 16;
  ctx.textAlign    = item.textAlign;
  const lines  = wrapCanvasText(ctx, item.text, maxW);
  const lineH  = eff * 1.22;
  const alignX = item.textAlign === 'left'  ? -maxW / 2 :
                 item.textAlign === 'right' ?  maxW / 2 : 0;
  lines.forEach((line, i) => {
    ctx.fillText(line, alignX, (i - (lines.length - 1) / 2) * lineH);
  });
  ctx.restore();
}

export function drawImageItemToContext(ctx, item, img) {
  if (!img) return;
  const effW = item.baseW * item.scale;
  const effH = (item.baseH || item.baseW) * item.scale;
  const cx = item.x + item.baseW / 2;
  const cy = item.y + (item.baseH || item.baseW) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(item.rotation * Math.PI / 180);
  ctx.drawImage(img, -effW / 2, -effH / 2, effW, effH);
  ctx.restore();
}

/**
 * useStickerSystem — manages all sticker state, refs, and logic.
 */
export function useStickerSystem({
  ctxRef,
  setScrimVisible,
  onBeforeOpen,
  showToast,
  onItemDragStart,
  onItemDragEnd,
  overlayParentRef,
  onItemPlaced,
  onItemTouched,
  onItemRemoved,
  onItemsCleared,
}) {
  // ── DOM refs (sticker panel) ──
  const stickerOverlayRef = useRef(null);
  const stkTrashBinRef    = useRef(null);
  const spGridRef         = useRef(null);
  const spEmojiWrapRef    = useRef(null);
  const spEmojiGridRef    = useRef(null);
  const spEmojiCatsRef    = useRef(null);
  const spEmojiSearchRef  = useRef(null);
  const stickerPhotoInputRef = useRef(null);

  // ── DOM refs (new sticker screen canvases) ──
  const nsImageCanvasRef  = useRef(null);
  const nsMaskCanvasRef   = useRef(null);
  const nsLassoCanvasRef  = useRef(null);
  const nsLoadingRef      = useRef(null);
  const nsBarLassoRef     = useRef(null);
  const nsBarRefineRef    = useRef(null);
  const nsBtnConfirmRef   = useRef(null);
  const nsBtnRefineBackRef = useRef(null);
  const nsBrushPanelRef   = useRef(null);
  const nsTrackTopRef     = useRef(null);
  const nsTrackBottomRef  = useRef(null);
  const nsBrushHandleRef  = useRef(null);
  const nsHeaderRef       = useRef(null);
  const nsOpacitySliderRef = useRef(null);
  const nsOpacityValRef   = useRef(null);

  // ── Data refs ──
  const stickerLibraryRef  = useRef([]);
  const placedStickersRef  = useRef([]);
  const selectedStickerRef = useRef(null);
  const pendingStickerSrcRef = useRef(null);
  const stickerTabRef      = useRef('recents');
  const activeCatIdRef     = useRef('all');
  const onItemDragStartRef = useRef(onItemDragStart);
  const onItemDragEndRef   = useRef(onItemDragEnd);

  // ── NS screen state refs ──
  const nsImageRef     = useRef(null);
  const nsMaskRef      = useRef(null);
  const nsDrawRectRef  = useRef(null);
  const nsLassoPtsRef  = useRef([]);
  const nsLassoDownRef = useRef(false);
  const nsLassoRAFRef  = useRef(null);
  const nsLassoDashRef = useRef(0);
  const nsPhaseRef     = useRef('select');
  const nsSelectionModeRef = useRef('freehand');
  const nsRefModeRef   = useRef('pen');
  const nsOpacityRef   = useRef(100);
  const nsBrushRRef    = useRef(16);
  const nsBrushDownRef = useRef(false);
  const nsBrushCollapseTimerRef = useRef(null);
  const nsBrushDraggingRef = useRef(false);
  const nsShapeDownRef = useRef(false);
  const nsShapeStartRef = useRef(null);

  // ── React state ──
  const [stickerTab, setStickerTab]             = useState('recents');
  const [stickerLibrary, setStickerLibrary]     = useState([]);
  const [stickerPanelVisible, setStickerPanelVisible] = useState(false);
  const [newStickerVisible, setNewStickerVisible] = useState(false);
  const [nsLassoCanConfirm, setNsLassoCanConfirm] = useState(false);
  const [nsPhase, setNsPhase] = useState('select');
  const [nsSelectionMode, setNsSelectionMode] = useState('freehand');
  const [nsDetecting, setNsDetecting] = useState(false);
  const [nsRefMode, setNsRefMode] = useState('pen');
  const [nsOpacity, setNsOpacity] = useState(100);

  useEffect(() => {
    onItemDragStartRef.current = onItemDragStart;
    onItemDragEndRef.current = onItemDragEnd;
  }, [onItemDragStart, onItemDragEnd]);

  useEffect(() => {
    const host = overlayParentRef?.current;
    const overlay = stickerOverlayRef.current;
    if (host && overlay && overlay.parentNode !== host) {
      host.appendChild(overlay);
    }
    if (host) {
      placedStickersRef.current.forEach(item => {
        if (item.el?.parentNode !== host) host.appendChild(item.el);
      });
    }
  }, [overlayParentRef]);

  const getPlacedItemHost = useCallback(() => (
    overlayParentRef?.current || stickerOverlayRef.current
  ), [overlayParentRef]);

  // Stable reference to removeSticker so the delete-button event handler can
  // call the latest version without recreating its listener every render.
  const removeStickerRef = useRef(null);

  // ── Transform ──
  const applyStickerTransform = useCallback((stk) => {
    stk.el.style.left      = stk.x + 'px';
    stk.el.style.top       = stk.y + 'px';
    stk.el.style.transform = `scale(${stk.scale}) rotate(${stk.rotation}deg)`;
    // Counter-transform the delete button so it stays at constant size and
    // upright regardless of the sticker's own scale/rotation.
    const delBtn = stk.el.querySelector(':scope > .stk-delete-btn');
    if (delBtn) {
      const invScale = stk.scale ? 1 / stk.scale : 1;
      delBtn.style.transform = `scale(${invScale}) rotate(${-stk.rotation}deg)`;
    }
  }, []);

  const bringStickerToFront = useCallback((stk) => {
    const current = placedStickersRef.current;
    const index = current.indexOf(stk);
    if (index >= 0 && index !== current.length - 1) {
      placedStickersRef.current = [
        ...current.slice(0, index),
        ...current.slice(index + 1),
        stk,
      ];
    }
    const host = getPlacedItemHost();
    if (host) host.appendChild(stk.el);
    onItemTouched?.(stk.layerId);
  }, [getPlacedItemHost, onItemTouched]);

  // ── Selection ──
  const deselectAllStickers = useCallback(() => {
    if (selectedStickerRef.current) selectedStickerRef.current.el.classList.remove('stk-selected');
    selectedStickerRef.current = null;
  }, []);

  const ensureDeleteButton = useCallback((stk) => {
    if (stk.el.querySelector(':scope > .stk-delete-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stk-delete-btn';
    btn.setAttribute('aria-label', 'Delete sticker');
    btn.innerHTML = (
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2.6" stroke-linecap="round">'
      + '<line x1="6" y1="6" x2="18" y2="18"/>'
      + '<line x1="18" y1="6" x2="6" y2="18"/>'
      + '</svg>'
    );
    // Parent sticker uses touchstart with preventDefault that swallows the
    // synthesized click. Handle the tap on pointerup/touchend ourselves and
    // just stop propagation to the parent.
    let pressed = false;
    let startedAt = 0;
    const startPress = (event) => {
      pressed = true;
      startedAt = Date.now();
      event.stopPropagation();
    };
    const cancelPress = (event) => {
      pressed = false;
      event.stopPropagation();
    };
    const endPress = (event) => {
      event.stopPropagation();
      const wasPressed = pressed;
      pressed = false;
      if (!wasPressed) return;
      if (Date.now() - startedAt > 700) return;
      removeStickerRef.current?.(stk);
    };
    btn.addEventListener('pointerdown', startPress);
    btn.addEventListener('pointerup', endPress);
    btn.addEventListener('pointercancel', cancelPress);
    btn.addEventListener('touchstart', startPress, { passive: true });
    btn.addEventListener('touchend', (event) => { event.preventDefault(); endPress(event); }, { passive: false });
    btn.addEventListener('touchcancel', cancelPress, { passive: true });
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      removeStickerRef.current?.(stk);
    });
    stk.el.appendChild(btn);
  }, []);

  const selectSticker = useCallback((stk) => {
    bringStickerToFront(stk);
    deselectAllStickers();
    selectedStickerRef.current = stk;
    stk.el.classList.add('stk-selected');
    ensureDeleteButton(stk);
    applyStickerTransform(stk);
  }, [applyStickerTransform, bringStickerToFront, deselectAllStickers, ensureDeleteButton]);

  // ── Remove ──
  const removeSticker = useCallback((stk) => {
    stk.el.remove();
    onItemRemoved?.(stk.layerId);
    placedStickersRef.current = placedStickersRef.current.filter(s => s !== stk);
    if (selectedStickerRef.current === stk) selectedStickerRef.current = null;
    if (placedStickersRef.current.length === 0 && stickerOverlayRef.current) {
      stickerOverlayRef.current.classList.remove('stk-active');
    }
  }, [onItemRemoved]);

  useEffect(() => {
    removeStickerRef.current = removeSticker;
  }, [removeSticker]);

  // ── Drag / pinch ──
  const setupStickerDrag = useCallback((stk) => {
    const el = stk.el;
    let dragging=false;
    let gesture=null;
    let gestureMode=null;
    let interactionActive=false;
    function beginInteraction() {
      if (interactionActive) return;
      interactionActive = true;
      onItemDragStartRef.current?.();
    }
    function endInteraction() {
      if (!interactionActive) return;
      interactionActive = false;
      onItemDragEndRef.current?.();
    }
    function getGestureScaleFactor() {
      const s = getScreenScale();
      return { x: 1 / s, y: 1 / s };
    }
    function beginGesture(points, target) {
      gesture = beginTransformGesture({
        points,
        target,
        transform: stickerToTransform(stk),
        scaleFactor: getGestureScaleFactor(),
      });
      gestureMode = points.length >= 2 ? 'two-pointer' : points.length === 1 ? 'single-pointer' : null;
      dragging = gestureMode === 'single-pointer';
      el.classList.toggle('stk-dragging', dragging);
      if (dragging) showBin();
      else hideBin();
    }
    function applyGesture(points) {
      const result = updateTransformGesture(gesture, points, {
        allowSinglePointer: true,
        minScale: 0.2,
        maxScale: Infinity,
        moveTolerance: 0.5,
      });
      if (!result.moved || !result.transform) return false;
      applyTransformToSticker(stk, result.transform);
      applyStickerTransform(stk);
      if (dragging) updateBinHighlight();
      return true;
    }

    function checkOverTrash() {
      const bin = stkTrashBinRef.current;
      const overlay = stickerOverlayRef.current;
      if (!bin || !overlay) return false;
      const sr = el.getBoundingClientRect();
      const tr = bin.getBoundingClientRect();
      const cx = (sr.left + sr.right)  / 2;
      const cy = (sr.top  + sr.bottom) / 2;
      const pad = 18;
      return cx >= tr.left-pad && cx <= tr.right+pad && cy >= tr.top-pad && cy <= tr.bottom+pad;
    }
    function showBin() {
      if (stkTrashBinRef.current) stkTrashBinRef.current.classList.add('stk-trash-show');
    }
    function hideBin() {
      if (stkTrashBinRef.current) stkTrashBinRef.current.classList.remove('stk-trash-show', 'stk-trash-over');
    }
    function updateBinHighlight() {
      if (!stkTrashBinRef.current) return;
      stkTrashBinRef.current.classList.toggle('stk-trash-over', checkOverTrash());
    }
    function doDeleteIntoTrash() {
      const tr = stkTrashBinRef.current?.getBoundingClientRect();
      const sr = el.getBoundingClientRect();
      if (tr) {
        const s = getScreenScale();
        const dx = ((tr.left + tr.width/2)  - (sr.left + sr.width/2))  / s;
        const dy = ((tr.top  + tr.height/2) - (sr.top  + sr.height/2)) / s;
        el.style.transition = 'transform 0.22s cubic-bezier(0.4,0,1,1), opacity 0.22s ease';
        el.style.transform  = `translate(${dx}px,${dy}px) scale(0.1) rotate(${stk.rotation}deg)`;
      } else {
        el.style.transition = 'transform 0.18s cubic-bezier(0.55,0,1,0.45), opacity 0.18s ease';
        el.style.transform  = 'scale(0)';
      }
      el.style.opacity = '0';
      hideBin();
      setTimeout(() => removeSticker(stk), 230);
    }

    const stopFramePointerGesture = e => {
      e.stopPropagation();
    };
    el.addEventListener('pointerdown', stopFramePointerGesture);
    el.addEventListener('pointermove', stopFramePointerGesture);
    el.addEventListener('pointerup', stopFramePointerGesture);
    el.addEventListener('pointercancel', stopFramePointerGesture);

    el.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      selectSticker(stk);
      beginInteraction();
      beginGesture([pointFromClientEvent(e)], el);
      const onMove = e => {
        if (!gesture) return;
        applyGesture([pointFromClientEvent(e)]);
      };
      const onUp = () => {
        dragging = false;
        gesture = null;
        gestureMode = null;
        el.classList.remove('stk-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (checkOverTrash()) doDeleteIntoTrash();
        else {
          hideBin();
          onItemTouched?.(stk.layerId);
        }
        endInteraction();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    el.addEventListener('touchstart', e => {
      e.stopPropagation(); e.preventDefault();
      selectSticker(stk);
      beginInteraction();
      beginGesture(pointsFromTouchList(e.touches), el);
    }, { passive:false });

    el.addEventListener('touchmove', e => {
      e.stopPropagation(); e.preventDefault();
      const points = pointsFromTouchList(e.touches);
      const nextMode = points.length >= 2 ? 'two-pointer' : points.length === 1 ? 'single-pointer' : null;
      if (!gesture || nextMode !== gestureMode) {
        beginGesture(points, el);
        return;
      }
      applyGesture(points);
    }, { passive:false });

    function finishTouchInteraction(e) {
      if (e.touches.length > 0) {
        beginGesture(pointsFromTouchList(e.touches), el);
        return;
      }
      if (e.touches.length === 0) {
        dragging=false;
        gesture=null;
        gestureMode=null;
        el.classList.remove('stk-dragging');
        if (checkOverTrash()) doDeleteIntoTrash();
        else {
          hideBin();
          onItemTouched?.(stk.layerId);
        }
        endInteraction();
      }
    }

    el.addEventListener('touchend', finishTouchInteraction, { passive:true });
    el.addEventListener('touchcancel', finishTouchInteraction, { passive:true });
  }, [selectSticker, applyStickerTransform, removeSticker, onItemTouched]);

  // ── Place sticker (with smart sizing) ──
  const placeSticker = useCallback((src, naturalW, naturalH) => {
    const el = document.createElement('div');
    el.className = 'placed-sticker';
    const img = document.createElement('img');
    img.src = src;
    el.appendChild(img);

    let displayW, displayH;
    if (naturalW && naturalH) {
      const MAX = 150;
      const s = Math.min(MAX / naturalW, MAX / naturalH);
      displayW = Math.round(naturalW * s);
      displayH = Math.round(naturalH * s);
    } else {
      displayW = displayH = 120;
    }

    const canvas = ctxRef.current?.canvas;
    const x = ((canvas?.width || 414) - displayW) / 2;
    const y = ((canvas?.height || 736) - displayH) / 2;

    const stk = { id: Date.now(), el, src, x, y, scale: 1, rotation: 0, baseW: displayW, baseH: displayH };
    placedStickersRef.current.push(stk);
    onItemPlaced?.(stk, 'sticker');
    el.style.left      = x + 'px';
    el.style.top       = y + 'px';
    el.style.width     = displayW + 'px';
    el.style.transform = 'scale(1) rotate(0deg)';

    getPlacedItemHost()?.appendChild(el);
    stickerOverlayRef.current?.classList.add('stk-active');
    selectSticker(stk);
    el.addEventListener('click', ev => { ev.stopPropagation(); selectSticker(stk); });
    setupStickerDrag(stk);
  }, [ctxRef, getPlacedItemHost, selectSticker, setupStickerDrag, onItemPlaced]);

  const placePhoto = useCallback((image, options = {}) => {
    if (!image) return;
    placedStickersRef.current
      .filter(item => item.type === 'photo')
      .forEach(item => {
        onItemRemoved?.(item.layerId);
        item.el.remove();
      });
    if (selectedStickerRef.current?.type === 'photo') selectedStickerRef.current = null;
    placedStickersRef.current = placedStickersRef.current.filter(item => item.type !== 'photo');
    const canvas = ctxRef.current?.canvas;
    const canvasW = canvas?.width || 414;
    const canvasH = canvas?.height || 736;
    const naturalW = image.naturalWidth || image.width || canvasW;
    const naturalH = image.naturalHeight || image.height || canvasH;
    const fitScale = canvasW / naturalW;
    const displayW = Math.round(naturalW * fitScale);
    const displayH = Math.round(naturalH * fitScale);
    const x = Math.round((canvasW - displayW) / 2);
    const y = Math.round((canvasH - displayH) / 2);
    const src = options.src || image.src;

    const el = document.createElement('div');
    el.className = 'placed-photo';
    const img = document.createElement('img');
    img.src = src;
    el.appendChild(img);

    const stk = {
      id: Date.now(),
      type: 'photo',
      el,
      src,
      image,
      x,
      y,
      scale: 1,
      rotation: 0,
      baseW: displayW,
      baseH: displayH,
    };
    placedStickersRef.current.push(stk);
    onItemPlaced?.(stk, 'photo');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = displayW + 'px';
    el.style.height = displayH + 'px';
    el.style.transform = 'scale(1) rotate(0deg)';

    getPlacedItemHost()?.appendChild(el);
    stickerOverlayRef.current?.classList.add('stk-active');
    selectSticker(stk);
    el.addEventListener('click', ev => { ev.stopPropagation(); selectSticker(stk); });
    setupStickerDrag(stk);
  }, [ctxRef, getPlacedItemHost, selectSticker, setupStickerDrag, onItemPlaced, onItemRemoved]);

  // ── Place text ──
  const placeText = useCallback((text, font, size, color, align, wrapWidth = 280, opacity = 1) => {
    const f = TXT_FONTS[font] || TXT_FONTS.mono;
    const el = document.createElement('div');
    el.className = 'placed-text';
    el.textContent = text;
    el.style.fontFamily = f.family;
    el.style.fontWeight = f.weight;
    el.style.fontStyle  = f.style;
    el.style.fontSize   = size + 'px';
    el.style.color      = color;
    el.style.opacity    = String(opacity);
    el.style.textAlign  = align;
    el.style.textShadow = '0 2px 18px rgba(0,0,0,0.55)';

    el.style.position   = 'fixed';
    el.style.visibility = 'hidden';
    el.style.width      = `${wrapWidth}px`;
    el.style.maxWidth   = `${wrapWidth}px`;
    document.body.appendChild(el);
    const bw = wrapWidth;
    const bh = el.offsetHeight;
    el.remove();
    el.style.position = el.style.visibility = el.style.maxWidth = '';

    const canvas = ctxRef.current?.canvas;
    const x = Math.round(((canvas?.width || 414) - bw) / 2);
    const y = Math.round(((canvas?.height || 736) - bh) / 2);

    const stk = {
      id: Date.now(), el,
      type: 'text', text,
      fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style,
      fontSize: size, color, textAlign: align, wrapWidth, opacity,
      x, y, scale: 1, rotation: 0,
      baseW: bw, baseH: bh,
    };
    placedStickersRef.current.push(stk);
    onItemPlaced?.(stk, 'text');
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = bw + 'px';

    getPlacedItemHost()?.appendChild(el);
    stickerOverlayRef.current?.classList.add('stk-active');
    selectSticker(stk);
    el.addEventListener('click', ev => { ev.stopPropagation(); selectSticker(stk); });
    setupStickerDrag(stk);
  }, [ctxRef, getPlacedItemHost, selectSticker, setupStickerDrag, onItemPlaced]);

  // ── Canvas commit / draw ──
  const commitStickersToCanvas = useCallback(async () => {
    const stickers = placedStickersRef.current;
    if (stickers.length === 0) return;
    const ctx = ctxRef.current;
    for (const stk of stickers) {
      if (stk.type === 'text') {
        drawTextItemToContext(ctx, stk);
      } else {
        const img = await loadItemImage(stk);
        drawImageItemToContext(ctx, stk, img);
      }
    }
    stickers.forEach(s => s.el.remove());
    placedStickersRef.current = [];
    selectedStickerRef.current = null;
    if (stickerOverlayRef.current) stickerOverlayRef.current.classList.remove('stk-active');
  }, [ctxRef]);

  const drawStickersToContext = useCallback(async (offCtx) => {
    for (const stk of placedStickersRef.current) {
      if (stk.type === 'text') {
        drawTextItemToContext(offCtx, stk);
      } else {
        const img = await loadItemImage(stk);
        drawImageItemToContext(offCtx, stk, img);
      }
    }
  }, []);

  const clearStickers = useCallback(() => {
    placedStickersRef.current.forEach(s => s.el.remove());
    placedStickersRef.current = [];
    selectedStickerRef.current = null;
    onItemsCleared?.();
    if (stickerOverlayRef.current) stickerOverlayRef.current.classList.remove('stk-active');
  }, [onItemsCleared]);

  // ── NS screen helpers ──
  const nsSetPhaseState = useCallback((phase) => {
    nsPhaseRef.current = phase;
    setNsPhase(phase);
  }, []);

  const nsSetConfirmAvailable = useCallback((available) => {
    setNsLassoCanConfirm(available);
    if (nsBtnConfirmRef.current) nsBtnConfirmRef.current.disabled = !available;
  }, []);

  const nsClearSelectionListeners = useCallback(() => {
    const lc = nsLassoCanvasRef.current;
    if (lc?._nsLassoClean) { lc._nsLassoClean(); lc._nsLassoClean = null; }
    if (lc?._nsShapeClean) { lc._nsShapeClean(); lc._nsShapeClean = null; }
  }, []);

  const nsBuildPolyMask = useCallback((poly) => {
    const ic = nsImageCanvasRef.current;
    const draw = nsDrawRectRef.current;
    if (!ic || !draw || poly.length < 3) return null;
    const W = ic.width, H = ic.height;
    const mask = new Uint8Array(W * H);
    const x0 = Math.max(0, draw.x | 0);
    const y0 = Math.max(0, draw.y | 0);
    const x1 = Math.min(W - 1, Math.ceil(draw.x + draw.w));
    const y1 = Math.min(H - 1, Math.ceil(draw.y + draw.h));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (polyContains(x + 0.5, y + 0.5, poly)) mask[y * W + x] = 1;
      }
    }
    return mask;
  }, []);

  const nsPaintMaskCircle = useCallback((x, y, radius, val = 1) => {
    const ic = nsImageCanvasRef.current;
    if (!ic || !nsMaskRef.current) return;
    const W = ic.width, H = ic.height;
    const r = Math.max(1, radius);
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r));
    const y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy <= r2) nsMaskRef.current[py * W + px] = val;
      }
    }
  }, []);

  const nsPaintMaskLine = useCallback((from, to, radius, val = 1) => {
    if (!from || !to) return;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(2, radius * 0.45)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      nsPaintMaskCircle(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        radius,
        val
      );
    }
  }, [nsPaintMaskCircle]);

  const nsDrawDragShapePreview = useCallback((a, b) => {
    const lc = nsLassoCanvasRef.current;
    if (!lc || !a || !b) return;
    const ctx = lc.getContext('2d');
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.clearRect(0, 0, lc.width, lc.height);
    if (w < 2 || h < 2) return;
    const drawPath = (pathCtx) => {
      if (nsSelectionModeRef.current === 'circle') {
        pathCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else {
        pathCtx.rect(x, y, w, h);
      }
    };
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    drawPath(ctx);
    ctx.fill();
    ctx.restore();
    drawMagicSelectionStroke(ctx, { drawPath });
  }, []);

  const nsBuildDragShapeMask = useCallback((a, b) => {
    const ic = nsImageCanvasRef.current;
    const draw = nsDrawRectRef.current;
    if (!ic || !draw || !a || !b) return null;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 4 || h < 4) return null;
    const mask = new Uint8Array(ic.width * ic.height);
    const x0 = Math.max(0, draw.x | 0, Math.floor(x));
    const y0 = Math.max(0, draw.y | 0, Math.floor(y));
    const x1 = Math.min(ic.width - 1, Math.ceil(draw.x + draw.w), Math.ceil(x + w));
    const y1 = Math.min(ic.height - 1, Math.ceil(draw.y + draw.h), Math.ceil(y + h));
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const inside = nsSelectionModeRef.current === 'circle'
          ? (((px + 0.5 - cx) ** 2) / (rx ** 2) + ((py + 0.5 - cy) ** 2) / (ry ** 2)) <= 1
          : true;
        if (inside) mask[py * ic.width + px] = 1;
      }
    }
    return mask;
  }, []);

  const nsShowLoading = useCallback(() => {
    if (nsLoadingRef.current)        nsLoadingRef.current.style.display = '';
    if (nsBarLassoRef.current)       nsBarLassoRef.current.style.display = 'none';
    if (nsBarRefineRef.current)      nsBarRefineRef.current.style.display = 'none';
    if (nsLassoCanvasRef.current)    nsLassoCanvasRef.current.style.display = 'none';
  }, []);

  const nsRenderOverlay = useCallback(() => {
    const mc = nsMaskCanvasRef.current;
    if (!mc || !nsMaskRef.current) return;
    const ctx = mc.getContext('2d');
    ctx.clearRect(0, 0, mc.width, mc.height);
    const id = ctx.createImageData(mc.width, mc.height);
    const d  = id.data;
    for (let i = 0; i < nsMaskRef.current.length; i++) {
      if (!nsMaskRef.current[i]) continue;
      const p = i * 4;
      d[p] = 255; d[p+1] = 55; d[p+2] = 55; d[p+3] = 210;
    }
    ctx.putImageData(id, 0, 0);
    mc.style.opacity = String(nsOpacityRef.current / 100);
  }, []);

  // Clear every painted mark in the refine step so the user can start the
  // refinement over without backing out to the selection screen. Apply
  // becomes effectively a no-op until they paint something again.
  const nsClearAllMarks = useCallback(() => {
    if (!nsMaskRef.current) return;
    nsMaskRef.current.fill(0);
    const mc = nsMaskCanvasRef.current;
    if (mc) mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);
    if (showToast) showToast('Marks cleared');
  }, [showToast]);

  // ── NS brush panel ──
  const NS_PANEL_W    = 56;
  const NS_HANDLE_MIN = 6,  NS_HANDLE_MAX = 38;
  const NS_TRACK_TOP  = 38, NS_TRACK_BOT  = 210;
  const NS_BRUSH_MIN  = 4,  NS_BRUSH_MAX  = 60;

  const nsSetHandlePos = useCallback((norm) => {
    const size   = Math.round(NS_HANDLE_MIN + norm * (NS_HANDLE_MAX - NS_HANDLE_MIN));
    const trackY = NS_TRACK_TOP + (1 - norm) * (NS_TRACK_BOT - NS_TRACK_TOP);
    const h = nsBrushHandleRef.current;
    if (!h) return;
    h.style.width  = size + 'px';
    h.style.height = size + 'px';
    h.style.top    = (trackY - size / 2) + 'px';
    h.style.left   = ((NS_PANEL_W - size) / 2) + 'px';
  }, []);

  const nsApplyTrackNorm = useCallback((norm) => {
    norm = Math.max(0, Math.min(1, norm));
    nsBrushRRef.current = Math.round(NS_BRUSH_MIN + norm * (NS_BRUSH_MAX - NS_BRUSH_MIN));
    nsSetHandlePos(norm);
  }, [nsSetHandlePos]);

  const nsNormFromClientY = useCallback((clientY) => {
    const panel = nsBrushPanelRef.current;
    if (!panel) return 0.5;
    const rect = panel.getBoundingClientRect();
    return Math.max(0, Math.min(1,
      1 - (clientY - rect.top - NS_TRACK_TOP) / (NS_TRACK_BOT - NS_TRACK_TOP)));
  }, []);

  const nsExpandBrushPanel = useCallback(() => {
    const bp = nsBrushPanelRef.current;
    if (!bp) return;
    bp.style.transform = 'translateX(0)';
    clearTimeout(nsBrushCollapseTimerRef.current);
    nsBrushCollapseTimerRef.current = setTimeout(() => {
      if (bp) bp.style.transform = 'translateX(-28px)';
    }, 1800);
  }, []);

  // ── NS brush painting ──
  const nsEnableBrush = useCallback(() => {
    const mc = nsMaskCanvasRef.current;
    if (!mc) return;
    mc.classList.add('ns-brush-active');
    if (mc._nsBrushClean) mc._nsBrushClean();

    const getCanvasPos = e => {
      const r = mc.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
      return {
        x: Math.round((t.clientX - r.left) * (mc.width  / r.width)),
        y: Math.round((t.clientY - r.top)  * (mc.height / r.height))
      };
    };
    const paint = ({x, y}) => {
      const W = mc.width, H = mc.height;
      const r = nsBrushRRef.current;
      const val = nsRefModeRef.current === 'pen' ? 1 : 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx + dy*dy > r*r) continue;
          const nx = x+dx, ny = y+dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          nsMaskRef.current[ny * W + nx] = val;
        }
      }
      nsRenderOverlay();
    };

    const onStart = e => { e.preventDefault(); nsBrushDownRef.current = true; paint(getCanvasPos(e)); };
    const onMove  = e => { if (!nsBrushDownRef.current) return; e.preventDefault(); paint(getCanvasPos(e)); };
    const onEnd   = () => { nsBrushDownRef.current = false; };
    mc.addEventListener('mousedown',  onStart);
    mc.addEventListener('mousemove',  onMove);
    mc.addEventListener('mouseup',    onEnd);
    mc.addEventListener('touchstart', onStart, {passive: false});
    mc.addEventListener('touchmove',  onMove,  {passive: false});
    mc.addEventListener('touchend',   onEnd);
    mc._nsBrushClean = () => {
      mc.removeEventListener('mousedown',  onStart);
      mc.removeEventListener('mousemove',  onMove);
      mc.removeEventListener('mouseup',    onEnd);
      mc.removeEventListener('touchstart', onStart);
      mc.removeEventListener('touchmove',  onMove);
      mc.removeEventListener('touchend',   onEnd);
    };
  }, [nsRenderOverlay]);

  const nsDisableBrush = useCallback(() => {
    const mc = nsMaskCanvasRef.current;
    if (!mc) return;
    mc.classList.remove('ns-brush-active');
    if (mc._nsBrushClean) { mc._nsBrushClean(); mc._nsBrushClean = null; }
  }, []);

  // ── Phase 2 (refine) ──
  const nsPhase2 = useCallback(() => {
    const ic = nsImageCanvasRef.current;
    const mc = nsMaskCanvasRef.current;
    if (!ic || !mc) return;
    nsSetPhaseState('refine');
    setNsDetecting(false);
    mc.width  = ic.width;
    mc.height = ic.height;
    mc.style.display = 'block';
    nsRenderOverlay();

    if (nsLoadingRef.current)       nsLoadingRef.current.style.display       = 'none';
    if (nsLassoCanvasRef.current)   nsLassoCanvasRef.current.style.display   = 'none';
    if (nsBarLassoRef.current)      nsBarLassoRef.current.style.display      = 'none';
    if (nsBarRefineRef.current)     nsBarRefineRef.current.style.display     = '';
    if (nsBtnRefineBackRef.current) nsBtnRefineBackRef.current.style.display = 'flex';
    if (nsHeaderRef.current)        nsHeaderRef.current.style.display        = 'none';

    const bp = nsBrushPanelRef.current;
    if (bp) {
      bp.style.transform = 'translateX(-28px)';
      bp.style.display   = 'block';
      requestAnimationFrame(() => nsExpandBrushPanel());
    }
    nsEnableBrush();
  }, [nsRenderOverlay, nsEnableBrush, nsExpandBrushPanel, nsSetPhaseState]);

  // ── ML detection ──
  const nsDetectInLasso = useCallback(async (poly) => {
    const ic = nsImageCanvasRef.current;
    if (!ic) return;
    const mask = await detectSmartSelectionMask(ic, poly, { logPrefix: 'sticker' });
    if (!mask) return;
    nsMaskRef.current = mask;
    nsPhase2();
  }, [nsPhase2]);

  // ── NS lasso animation ──
  const nsAnimateLasso = useCallback(() => {
    const lc  = nsLassoCanvasRef.current;
    if (!lc) return;
    const ctx = lc.getContext('2d');
    ctx.clearRect(0, 0, lc.width, lc.height);
    const pts = nsLassoPtsRef.current;
    // Pen mode paints the red mask directly as the user drags, so a dashed
    // boundary overlay would just be visual noise. Loop/magic still need the
    // dashed preview to show the boundary being drawn.
    if (nsSelectionModeRef.current !== 'pen' && pts.length > 1) {
      drawMagicSelectionStroke(ctx, {
        points: pts,
        closed: !nsLassoDownRef.current,
        dashOffset: nsLassoDashRef.current,
      });
    }
    nsLassoDashRef.current = (nsLassoDashRef.current + 0.5) % MAGIC_SELECTION_DASH_CYCLE;
    nsLassoRAFRef.current = requestAnimationFrame(nsAnimateLasso);
  }, []);

  // ── NS lasso events ──
  const nsInitLassoEvents = useCallback(() => {
    const lc = nsLassoCanvasRef.current;
    if (!lc) return;
    if (lc._nsLassoClean) lc._nsLassoClean();

    const getPos = e => {
      const r = lc.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
      return {
        x: (t.clientX - r.left) * (lc.width  / r.width),
        y: (t.clientY - r.top)  * (lc.height / r.height)
      };
    };

    const onStart = e => {
      e.preventDefault();
      if (e.pointerId != null && lc.setPointerCapture) {
        try { lc.setPointerCapture(e.pointerId); } catch (_) {}
      }
      const p = getPos(e);
      nsLassoPtsRef.current = [p];
      nsLassoDownRef.current = true;
      nsSetConfirmAvailable(false);
      // 'pen' mode is the manual paint-as-you-draw outline (what 'freehand'
      // used to do). Freehand is now a Loop: collect points only, then fill
      // the interior of the closed polygon on release.
      if (nsSelectionModeRef.current === 'pen') {
        const ic = nsImageCanvasRef.current;
        const mc = nsMaskCanvasRef.current;
        if (!ic || !mc) return;
        mc.width = ic.width;
        mc.height = ic.height;
        mc.style.display = 'block';
        nsMaskRef.current = new Uint8Array(ic.width * ic.height);
        nsPaintMaskCircle(p.x, p.y, nsBrushRRef.current, 1);
        nsRenderOverlay();
      }
    };
    const onMove = e => {
      if (!nsLassoDownRef.current) return;
      e.preventDefault();
      const p = getPos(e);
      const prev = nsLassoPtsRef.current[nsLassoPtsRef.current.length - 1];
      nsLassoPtsRef.current.push(p);
      if (nsSelectionModeRef.current === 'pen') {
        nsPaintMaskLine(prev, p, nsBrushRRef.current, 1);
        nsRenderOverlay();
      }
    };
    const onEnd = e => {
      if (!nsLassoDownRef.current) return;
      if (e?.pointerId != null && lc.releasePointerCapture) {
        try { lc.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      nsLassoDownRef.current = false;
      const valid = nsLassoPtsRef.current.length >= 5;
      // Pen: mask was painted during drag — go straight to refine.
      if (nsSelectionModeRef.current === 'pen' && valid) {
        if (nsMaskRef.current) {
          if (nsLassoRAFRef.current) { cancelAnimationFrame(nsLassoRAFRef.current); nsLassoRAFRef.current = null; }
          nsPhase2();
          return;
        }
      }
      // Freehand (Loop): close the path into a polygon, fill interior, go to
      // refine. This fixes the long-standing "I drew around it but the inside
      // wasn't filled" confusion — boundaries now act like a lasso.
      if (nsSelectionModeRef.current === 'freehand' && valid) {
        const poly = nsLassoPtsRef.current.map(pt => [pt.x, pt.y]);
        const mask = nsBuildPolyMask(poly);
        if (mask) {
          nsMaskRef.current = mask;
          if (nsLassoRAFRef.current) { cancelAnimationFrame(nsLassoRAFRef.current); nsLassoRAFRef.current = null; }
          nsPhase2();
          return;
        }
      }
      nsSetConfirmAvailable(valid);
    };

    if (window.PointerEvent) {
      lc.addEventListener('pointerdown', onStart);
      lc.addEventListener('pointermove', onMove);
      lc.addEventListener('pointerup', onEnd);
      lc.addEventListener('pointercancel', onEnd);
    } else {
      lc.addEventListener('mousedown',  onStart);
      lc.addEventListener('mousemove',  onMove);
      lc.addEventListener('touchstart', onStart, {passive: false});
      lc.addEventListener('touchmove',  onMove,  {passive: false});
      lc.addEventListener('touchend',   onEnd);
      document.addEventListener('mouseup', onEnd);
    }

    lc._nsLassoClean = () => {
      lc.removeEventListener('pointerdown', onStart);
      lc.removeEventListener('pointermove', onMove);
      lc.removeEventListener('pointerup', onEnd);
      lc.removeEventListener('pointercancel', onEnd);
      lc.removeEventListener('mousedown',  onStart);
      lc.removeEventListener('mousemove',  onMove);
      lc.removeEventListener('touchstart', onStart);
      lc.removeEventListener('touchmove',  onMove);
      lc.removeEventListener('touchend',   onEnd);
      document.removeEventListener('mouseup', onEnd);
    };
  }, [nsBuildPolyMask, nsPaintMaskCircle, nsPaintMaskLine, nsPhase2, nsRenderOverlay, nsSetConfirmAvailable]);

  const nsInitShapeEvents = useCallback(() => {
    const lc = nsLassoCanvasRef.current;
    if (!lc) return;
    if (lc._nsShapeClean) lc._nsShapeClean();

    const canvasPoint = (e) => {
      const rect = lc.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
      return {
        x: (t.clientX - rect.left) * (lc.width / rect.width),
        y: (t.clientY - rect.top) * (lc.height / rect.height),
      };
    };
    const onDown = (e) => {
      e.preventDefault();
      if (lc.setPointerCapture) {
        try { lc.setPointerCapture(e.pointerId); } catch (_) {}
      }
      nsShapeDownRef.current = true;
      nsShapeStartRef.current = canvasPoint(e);
      nsSetConfirmAvailable(false);
    };
    const onMove = (e) => {
      if (!nsShapeDownRef.current) return;
      e.preventDefault();
      nsDrawDragShapePreview(nsShapeStartRef.current, canvasPoint(e));
    };
    const onUp = (e) => {
      if (!nsShapeDownRef.current) return;
      if (lc.releasePointerCapture) {
        try { lc.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      e.preventDefault();
      nsShapeDownRef.current = false;
      const mask = nsBuildDragShapeMask(nsShapeStartRef.current, canvasPoint(e));
      nsShapeStartRef.current = null;
      if (!mask) {
        lc.getContext('2d').clearRect(0, 0, lc.width, lc.height);
        return;
      }
      nsMaskRef.current = mask;
      nsPhase2();
    };

    lc.addEventListener('pointerdown', onDown);
    lc.addEventListener('pointermove', onMove);
    lc.addEventListener('pointerup', onUp);
    lc.addEventListener('pointercancel', onUp);
    lc.addEventListener('touchstart', onDown, { passive: false });
    lc.addEventListener('touchmove', onMove, { passive: false });
    lc.addEventListener('touchend', onUp);
    lc._nsShapeClean = () => {
      lc.removeEventListener('pointerdown', onDown);
      lc.removeEventListener('pointermove', onMove);
      lc.removeEventListener('pointerup', onUp);
      lc.removeEventListener('pointercancel', onUp);
      lc.removeEventListener('touchstart', onDown);
      lc.removeEventListener('touchmove', onMove);
      lc.removeEventListener('touchend', onUp);
    };
  }, [nsBuildDragShapeMask, nsDrawDragShapePreview, nsPhase2, nsSetConfirmAvailable]);

  // ── Draw image + start lasso ──
  const nsDrawImageAndStartLasso = useCallback(() => {
    const img = nsImageRef.current;
    if (!img) return;

    nsSetPhaseState('select');
    setNsDetecting(false);
    if (nsBarLassoRef.current)  nsBarLassoRef.current.style.display  = '';
    if (nsBarRefineRef.current) nsBarRefineRef.current.style.display = 'none';
    nsSetConfirmAvailable(false);

    requestAnimationFrame(() => {
      const ic = nsImageCanvasRef.current;
      const lc = nsLassoCanvasRef.current;
      if (!ic || !lc) return;

      // Fit the source photo to the full preview width. The preview itself
      // starts after the shared chrome inset/header row, so the image never
      // tucks under the top controls.
      const W = ic.parentElement?.offsetWidth  || 414;
      const H = ic.parentElement?.offsetHeight || 681;
      const fitWidthScale = W / img.naturalWidth;
      const fitHeightScale = H / img.naturalHeight;
      const scale = Math.min(fitWidthScale, fitHeightScale);
      const dw = Math.round(img.naturalWidth  * scale);
      const dh = Math.round(img.naturalHeight * scale);
      const dx = Math.round((W - dw) / 2);
      const dy = Math.round((H - dh) / 2);

      ic.width = lc.width = W;
      ic.height = lc.height = H;

      const ictx = ic.getContext('2d');
      ictx.clearRect(0, 0, W, H);

      if (nsLoadingRef.current)    nsLoadingRef.current.style.display = 'none';
      ic.style.display = 'block';
      lc.style.display = 'block';

      nsClearSelectionListeners();
      nsLassoPtsRef.current = [];
      nsLassoDownRef.current = false;
      if (nsLassoRAFRef.current) cancelAnimationFrame(nsLassoRAFRef.current);
      nsLassoRAFRef.current = null;

      nsDrawRectRef.current = { x: dx, y: dy, w: dw, h: dh };
      ictx.drawImage(img, dx, dy, dw, dh);

      if (nsSelectionModeRef.current === 'circle' || nsSelectionModeRef.current === 'rect') {
        nsInitShapeEvents();
        return;
      }

      nsAnimateLasso();
      nsInitLassoEvents();
    });
  }, [nsAnimateLasso, nsClearSelectionListeners, nsInitLassoEvents, nsInitShapeEvents, nsSetConfirmAvailable, nsSetPhaseState]);

  // ── NS confirm selection → mask/refine ──
  const nsConfirmLasso = useCallback(() => {
    const mode = nsSelectionModeRef.current;
    if (nsLassoPtsRef.current.length < 5) return;
    const poly = nsLassoPtsRef.current.map(p => [p.x, p.y]);
    cancelAnimationFrame(nsLassoRAFRef.current); nsLassoRAFRef.current = null;
    if (nsLassoCanvasRef.current)   nsLassoCanvasRef.current.style.display = 'none';
    if (nsBarLassoRef.current)      nsBarLassoRef.current.style.display = 'none';
    if (mode === 'magic') {
      nsSetPhaseState('detecting');
      setNsDetecting(true);
      if (nsLoadingRef.current) nsLoadingRef.current.style.display = '';
      nsDetectInLasso(poly);
      return;
    }
    const mask = nsBuildPolyMask(poly);
    if (!mask) return;
    nsMaskRef.current = mask;
    nsPhase2();
  }, [nsBuildPolyMask, nsDetectInLasso, nsPhase2, nsSetPhaseState]);

  // ── NS back to lasso ──
  const nsBackToLasso = useCallback(() => {
    nsDisableBrush();
    nsMaskRef.current = null;
    if (nsMaskCanvasRef.current)    nsMaskCanvasRef.current.style.display    = 'none';
    if (nsBtnRefineBackRef.current) nsBtnRefineBackRef.current.style.display = 'none';
    if (nsHeaderRef.current)        nsHeaderRef.current.style.display        = '';
    clearTimeout(nsBrushCollapseTimerRef.current);
    const bp = nsBrushPanelRef.current;
    if (bp) { bp.style.transform = 'translateX(-28px)'; bp.style.display = 'none'; }
    if (nsBarRefineRef.current) nsBarRefineRef.current.style.display = 'none';
    if (nsBarLassoRef.current)  nsBarLassoRef.current.style.display  = '';
    nsDrawImageAndStartLasso();
  }, [nsDisableBrush, nsDrawImageAndStartLasso]);

  // ── NS apply ──
  const nsApply = useCallback(() => {
    if (!nsImageRef.current || !nsMaskRef.current || !nsDrawRectRef.current) return;
    const ic = nsImageCanvasRef.current;
    if (!ic) return;
    const W  = ic.width, H = ic.height;
    const {x: dx, y: dy, w: dw, h: dh} = nsDrawRectRef.current;

    const full = Object.assign(document.createElement('canvas'), {width: dw, height: dh});
    const fctx = full.getContext('2d');
    fctx.drawImage(ic, dx, dy, dw, dh, 0, 0, dw, dh);

    const id = fctx.getImageData(0, 0, dw, dh);
    const d  = id.data;
    let minX = dw, maxX = -1, minY = dh, maxY = -1;
    for (let py = 0; py < dh; py++) {
      for (let px2 = 0; px2 < dw; px2++) {
        const maskIdx = (py + dy) * W + (px2 + dx);
        if (!nsMaskRef.current[maskIdx]) {
          d[(py * dw + px2) * 4 + 3] = 0;
        } else {
          d[(py * dw + px2) * 4 + 3] = Math.round(d[(py * dw + px2) * 4 + 3] * (nsOpacityRef.current / 100));
          if (px2 < minX) minX = px2;
          if (px2 > maxX) maxX = px2;
          if (py < minY)  minY = py;
          if (py > maxY)  maxY = py;
        }
      }
    }
    fctx.putImageData(id, 0, 0);
    if (maxX < 0 || maxY < 0) return;

    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = Object.assign(document.createElement('canvas'), {width: cw, height: ch});
    out.getContext('2d').drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch);

    const src = out.toDataURL('image/png');
    stickerLibraryRef.current.push({ id: Date.now(), src });
    setStickerLibrary([...stickerLibraryRef.current]);
    placeSticker(src, cw, ch);
    closeNewStickerScreen(false);
  }, [placeSticker]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel open / close ──
  const closePanel = useCallback(() => {
    setStickerPanelVisible(false);
    setScrimVisible(false);
  }, [setScrimVisible]);

  // ── Render sticker content ──
  // Visibility (display: none/grid/flex) is React-controlled via inline style props
  // bound to stickerTab + stickerLibrary state. This function only manages cell content.
  const renderStickerContent = useCallback(() => {
    const grid = spGridRef.current;
    if (!grid) return;
    const tab = stickerTabRef.current;
    if (tab === 'emoji') return;
    if (stickerLibraryRef.current.length === 0) return;
    grid.innerHTML = '';
    const addCell = document.createElement('button');
    addCell.className = 'sp-add-cell';
    addCell.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="var(--icon-stroke-width)" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addCell.addEventListener('click', () => stickerPhotoInputRef.current?.click());
    grid.appendChild(addCell);
    const list = tab === 'recents'
      ? [...stickerLibraryRef.current].reverse().slice(0, 12)
      : stickerLibraryRef.current;
    list.forEach(stk => {
      const cell = document.createElement('button');
      cell.className = 'sp-sticker-cell';
      const img = document.createElement('img');
      img.src = stk.src;
      cell.appendChild(img);
      cell.addEventListener('click', () => { placeSticker(stk.src); closePanel(); });
      grid.appendChild(cell);
    });
  }, [placeSticker, closePanel]);

  const openPanel = useCallback(() => {
    if (onBeforeOpen) onBeforeOpen();
    renderStickerContent();
    setStickerPanelVisible(true);
    setScrimVisible(true);
  }, [onBeforeOpen, renderStickerContent, setScrimVisible]);

  const handleTabClick = useCallback((tab) => {
    stickerTabRef.current = tab;
    setStickerTab(tab);
    renderStickerContent();
  }, [renderStickerContent]);

  // ── New sticker screen open ──
  const openNewStickerScreen = useCallback((src) => {
    pendingStickerSrcRef.current = src;
    nsImageRef.current     = null;
    nsMaskRef.current      = null;
    nsDrawRectRef.current  = null;
    nsLassoPtsRef.current  = [];
    nsLassoDownRef.current = false;
    nsPhaseRef.current     = 'select';
    nsSelectionModeRef.current = 'freehand';
    setNsPhase('select');
    setNsSelectionMode('freehand');
    setNsDetecting(false);
    nsSetConfirmAvailable(false);
    nsRefModeRef.current   = 'pen';
    nsOpacityRef.current   = 100;
    setNsRefMode('pen');
    setNsOpacity(100);
    nsBrushDownRef.current = false;

    if (nsLassoRAFRef.current) { cancelAnimationFrame(nsLassoRAFRef.current); nsLassoRAFRef.current = null; }
    nsClearSelectionListeners();

    // Reset canvases
    if (nsImageCanvasRef.current)   nsImageCanvasRef.current.style.display   = 'none';
    if (nsMaskCanvasRef.current)    nsMaskCanvasRef.current.style.display    = 'none';
    if (nsLassoCanvasRef.current)   nsLassoCanvasRef.current.style.display   = 'none';
    if (nsLoadingRef.current)       nsLoadingRef.current.style.display       = '';
    if (nsBarLassoRef.current)      nsBarLassoRef.current.style.display      = 'none';
    if (nsBarRefineRef.current)     nsBarRefineRef.current.style.display     = 'none';
    if (nsBtnRefineBackRef.current) nsBtnRefineBackRef.current.style.display = 'none';
    if (nsBrushPanelRef.current) {
      nsBrushPanelRef.current.style.transform = 'translateX(-28px)';
      nsBrushPanelRef.current.style.display   = 'none';
    }
    if (nsHeaderRef.current) nsHeaderRef.current.style.display = '';
    if (nsOpacitySliderRef.current) nsOpacitySliderRef.current.value = '100';
    if (nsOpacityValRef.current)    nsOpacityValRef.current.textContent = '100%';

    setNewStickerVisible(true);
    const img = new Image();
    img.onload = () => { nsImageRef.current = img; nsDrawImageAndStartLasso(); };
    img.src = src;
  }, [nsClearSelectionListeners, nsDrawImageAndStartLasso, nsSetConfirmAvailable]);

  // ── NS close ──
  const closeNewStickerScreen = useCallback((reopenPanel = true) => {
    setNewStickerVisible(false);
    nsSetConfirmAvailable(false);
    setNsDetecting(false);
    if (nsLassoRAFRef.current) { cancelAnimationFrame(nsLassoRAFRef.current); nsLassoRAFRef.current = null; }
    nsDisableBrush();
    nsClearSelectionListeners();
    if (nsImageCanvasRef.current)   nsImageCanvasRef.current.style.display   = 'none';
    if (nsMaskCanvasRef.current)    nsMaskCanvasRef.current.style.display    = 'none';
    if (nsLassoCanvasRef.current)   nsLassoCanvasRef.current.style.display   = 'none';
    if (nsBtnRefineBackRef.current) nsBtnRefineBackRef.current.style.display = 'none';
    if (nsHeaderRef.current)        nsHeaderRef.current.style.display        = '';
    clearTimeout(nsBrushCollapseTimerRef.current);
    const bp = nsBrushPanelRef.current;
    if (bp) { bp.style.transform = 'translateX(-28px)'; bp.style.display = 'none'; }
    pendingStickerSrcRef.current = null;
    nsImageRef.current    = null;
    nsMaskRef.current     = null;
    nsDrawRectRef.current = null;
    if (reopenPanel) {
      setTimeout(() => { renderStickerContent(); setStickerPanelVisible(true); setScrimVisible(true); }, 200);
    }
  }, [nsClearSelectionListeners, nsDisableBrush, nsSetConfirmAvailable, renderStickerContent, setScrimVisible]);

  // ── File input handler ── now opens NS screen (lasso flow)
  const handleStickerPhotoChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    closePanel();
    openNewStickerScreen(url);
    e.target.value = '';
  }, [closePanel, openNewStickerScreen]);

  const nsSetSelectionMode = useCallback((mode) => {
    nsSelectionModeRef.current = mode;
    setNsSelectionMode(mode);
    nsDrawImageAndStartLasso();
  }, [nsDrawImageAndStartLasso]);

  const nsSetRefMode = useCallback((mode) => {
    nsRefModeRef.current = mode;
    setNsRefMode(mode);
  }, []);

  const nsHandleOpacityInput = useCallback((e) => {
    const val = +e.target.value;
    nsOpacityRef.current = val;
    setNsOpacity(val);
    e.target.style.setProperty('--fill', val + '%');
    if (nsOpacityValRef.current) nsOpacityValRef.current.textContent = val + '%';
    if (nsMaskCanvasRef.current) nsMaskCanvasRef.current.style.opacity = String(val / 100);
  }, []);

  // ── Build emoji grid ──
  const buildEmojiGrid = useCallback(() => {
    const grid     = spEmojiGridRef.current;
    const catsBar  = spEmojiCatsRef.current;
    const search   = spEmojiSearchRef.current;
    if (!grid || !catsBar) return;

    // Build category pills
    catsBar.innerHTML = '';
    EMOJI_CATS.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'sp-cat-pill' + (cat.id === activeCatIdRef.current ? ' active' : '');
      pill.textContent = cat.label;
      pill.addEventListener('click', () => {
        activeCatIdRef.current = cat.id;
        if (search) search.value = '';
        catsBar.querySelectorAll('.sp-cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        renderEmojiGrid();
      });
      catsBar.appendChild(pill);
    });

    function renderEmojiGrid() {
      grid.innerHTML = '';
      const q = (search?.value || '').trim().toLowerCase();
      if (q) {
        EMOJI_CATS[0].emojis.forEach(em => {
          if (emojiMatchesQuery(em, q)) appendBtn(em);
        });
        if (!grid.children.length) {
          const msg = document.createElement('p');
          msg.style.cssText = 'grid-column:1/-1;color:rgba(255,255,255,0.35);font-family:Bedstead,monospace;font-size:13px;padding:24px 0;text-align:center';
          msg.textContent = 'No results';
          grid.appendChild(msg);
        }
        return;
      }
      const cats = activeCatIdRef.current === 'all'
        ? EMOJI_CATS.slice(1)
        : EMOJI_CATS.filter(c => c.id === activeCatIdRef.current);
      cats.forEach(cat => {
        if (activeCatIdRef.current === 'all') {
          const lbl = document.createElement('div');
          lbl.className = 'sp-emoji-cat-label';
          lbl.textContent = cat.label;
          grid.appendChild(lbl);
        }
        cat.emojis.forEach(em => appendBtn(em));
      });
    }

    function appendBtn(em) {
      const btn = document.createElement('button');
      btn.className = 'sp-emoji-btn';
      btn.textContent = em;
      btn.addEventListener('click', () => {
        placeSticker(emojiToDataURL(em));
        closePanel();
      });
      grid.appendChild(btn);
    }

    if (search) search.addEventListener('input', renderEmojiGrid);
    renderEmojiGrid();
  }, [placeSticker, closePanel]);

  // ── Brush panel events (wired after mount) ──
  useEffect(() => {
    const bp = nsBrushPanelRef.current;
    if (!bp) return;

    const norm0 = (nsBrushRRef.current - NS_BRUSH_MIN) / (NS_BRUSH_MAX - NS_BRUSH_MIN);
    nsApplyTrackNorm(norm0);

    const onEnter = () => nsExpandBrushPanel();
    const onDown  = e => {
      nsExpandBrushPanel();
      nsBrushDraggingRef.current = true;
      nsApplyTrackNorm(nsNormFromClientY(e.clientY));
    };
    const onMove  = e => { if (nsBrushDraggingRef.current) nsApplyTrackNorm(nsNormFromClientY(e.clientY)); };
    const onUp    = () => { nsBrushDraggingRef.current = false; };
    const onTouchStart = e => {
      nsExpandBrushPanel();
      nsBrushDraggingRef.current = true;
      nsApplyTrackNorm(nsNormFromClientY(e.touches[0].clientY));
    };
    const onTouchMove = e => {
      if (nsBrushDraggingRef.current) nsApplyTrackNorm(nsNormFromClientY(e.touches[0].clientY));
    };
    const onTouchEnd = () => { nsBrushDraggingRef.current = false; };

    bp.addEventListener('mouseenter', onEnter);
    bp.addEventListener('mousedown',  onDown);
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseup',    onUp);
    bp.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove',  onTouchMove, { passive: true });
    document.addEventListener('touchend',   onTouchEnd, { passive: true });

    return () => {
      bp.removeEventListener('mouseenter', onEnter);
      bp.removeEventListener('mousedown',  onDown);
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseup',    onUp);
      bp.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove',  onTouchMove);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, [nsApplyTrackNorm, nsExpandBrushPanel, nsNormFromClientY]);

  // Build emoji grid once on mount
  useEffect(() => {
    buildEmojiGrid();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Paste (Ctrl/Cmd+V) ──
  useEffect(() => {
    const handlePaste = async (e) => {
      const active = document.activeElement;
      if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      let file = null;
      for (const item of items) { if (item.type.startsWith('image/')) { file = item.getAsFile(); break; } }
      if (!file) return;
      e.preventDefault();
      const src = await new Promise(res => {
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          res(c.toDataURL('image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); res(null); };
        img.src = url;
      });
      if (!src) return;
      stickerLibraryRef.current.push({ id: Date.now(), src });
      setStickerLibrary([...stickerLibraryRef.current]);
      const panelOpen = stickerPanelVisible;
      if (panelOpen) {
        stickerTabRef.current = 'mystickers';
        setStickerTab('mystickers');
        renderStickerContent();
        if (showToast) showToast('Sticker saved!');
      } else {
        placeSticker(src);
        if (showToast) showToast('Sticker added!');
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [stickerPanelVisible, placeSticker, renderStickerContent, showToast]);

  return {
    // Panel refs
    stickerOverlayRef,
    stkTrashBinRef,
    spGridRef,
    spEmojiWrapRef,
    spEmojiGridRef,
    spEmojiCatsRef,
    spEmojiSearchRef,
    stickerPhotoInputRef,
    // NS refs
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
    nsRefModeRef,
    nsOpacityRef,
    // Data ref
    placedStickersRef,
    // State
    stickerTab,
    stickerLibrary,
    stickerPanelVisible,
    newStickerVisible,
    nsLassoCanConfirm,
    nsPhase,
    nsSelectionMode,
    nsDetecting,
    nsRefMode,
    nsOpacity,
    // Panel control
    openPanel,
    closePanel,
    handleTabClick,
    // NS screen
    nsConfirmLasso,
    nsBackToLasso,
    nsApply,
    nsClearAllMarks,
    nsSetSelectionMode,
    nsSetRefMode,
    nsHandleOpacityInput,
    // Sticker ops
    placeSticker,
    placePhoto,
    placeText,
    bringStickerToFront,
    deselectAllStickers,
    commitStickersToCanvas,
    drawStickersToContext,
    clearStickers,
    // File input
    handleStickerPhotoChange,
    // Compat shims (no longer needed but keep signature stable)
    closeNewStickerScreen,
    handleNewStickerAdd: nsApply,
  };
}

function getScreenScale() {
  const frame = document.getElementById('frameContainer');
  const canvas = document.getElementById('editCanvas');
  const rect = frame?.getBoundingClientRect?.();
  if (rect?.width && canvas?.width) return rect.width / canvas.width;
  return 1;
}
