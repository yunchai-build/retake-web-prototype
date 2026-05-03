import { useRef, useState, useCallback, useEffect } from 'react';
import { TXT_FONTS } from './useTextTool';
import { sqDist3, kMeans, keepLargestCC, fillHoles, morphClose, polyContains } from '../utils/imageProcessing';

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

// ── MediaPipe lazy loader ──
let _nsMpSeg = null;
let _nsMpErr = false;

async function nsGetSegmenter() {
  if (_nsMpSeg) return _nsMpSeg;
  if (_nsMpErr) return null;
  try {
    const { InteractiveSegmenter, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/vision_bundle.mjs'
    );
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
    );
    _nsMpSeg = await InteractiveSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
        delegate: 'GPU',
      },
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    return _nsMpSeg;
  } catch (e) {
    console.warn('[sticker] MediaPipe load failed — using K-means fallback:', e);
    _nsMpErr = true;
    return null;
  }
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

  // ── Transform ──
  const applyStickerTransform = useCallback((stk) => {
    stk.el.style.left      = stk.x + 'px';
    stk.el.style.top       = stk.y + 'px';
    stk.el.style.transform = `scale(${stk.scale}) rotate(${stk.rotation}deg)`;
  }, []);

  // ── Selection ──
  const deselectAllStickers = useCallback(() => {
    if (selectedStickerRef.current) selectedStickerRef.current.el.classList.remove('stk-selected');
    selectedStickerRef.current = null;
  }, []);

  const selectSticker = useCallback((stk) => {
    deselectAllStickers();
    selectedStickerRef.current = stk;
    stk.el.classList.add('stk-selected');
  }, [deselectAllStickers]);

  // ── Remove ──
  const removeSticker = useCallback((stk) => {
    stk.el.remove();
    placedStickersRef.current = placedStickersRef.current.filter(s => s !== stk);
    if (selectedStickerRef.current === stk) selectedStickerRef.current = null;
    if (placedStickersRef.current.length === 0 && stickerOverlayRef.current) {
      stickerOverlayRef.current.classList.remove('stk-active');
    }
  }, []);

  // ── Drag / pinch ──
  const setupStickerDrag = useCallback((stk) => {
    const el = stk.el;
    let t1x=0, t1y=0, t2x=0, t2y=0;
    let startX=0, startY=0, startSX=0, startSY=0;
    let startMidX=0, startMidY=0;
    let startDist=0, startScale=1, startAngle=0, startRot=0;
    let dragging=false, pinching=false;
    let interactionActive=false;
    function dist(ax,ay,bx,by){ return Math.sqrt((bx-ax)**2+(by-ay)**2); }
    function angle(ax,ay,bx,by){ return Math.atan2(by-ay, bx-ax); }
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

    el.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      selectSticker(stk);
      dragging = true;
      beginInteraction();
      el.classList.add('stk-dragging');
      startX = e.clientX; startY = e.clientY;
      startSX = stk.x; startSY = stk.y;
      showBin();
      const onMove = e => {
        if (!dragging) return;
        const s = getScreenScale();
        stk.x = startSX + (e.clientX - startX) / s;
        stk.y = startSY + (e.clientY - startY) / s;
        applyStickerTransform(stk);
        updateBinHighlight();
      };
      const onUp = () => {
        dragging = false;
        el.classList.remove('stk-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (checkOverTrash()) doDeleteIntoTrash();
        else hideBin();
        endInteraction();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    el.addEventListener('touchstart', e => {
      e.stopPropagation(); e.preventDefault();
      selectSticker(stk);
      if (e.touches.length === 1) {
        dragging=true; pinching=false;
        beginInteraction();
        el.classList.add('stk-dragging');
        t1x=e.touches[0].clientX; t1y=e.touches[0].clientY;
        startSX=stk.x; startSY=stk.y;
        showBin();
      } else if (e.touches.length === 2) {
        dragging=false; pinching=true;
        beginInteraction();
        el.classList.remove('stk-dragging');
        hideBin();
        const a=e.touches[0], b=e.touches[1];
        t1x=a.clientX; t1y=a.clientY; t2x=b.clientX; t2y=b.clientY;
        startMidX=(t1x+t2x)/2; startMidY=(t1y+t2y)/2;
        startDist=dist(t1x,t1y,t2x,t2y);
        startScale=stk.scale; startAngle=angle(t1x,t1y,t2x,t2y); startRot=stk.rotation;
        startSX=stk.x; startSY=stk.y;
      }
    }, { passive:false });

    el.addEventListener('touchmove', e => {
      e.stopPropagation(); e.preventDefault();
      if (dragging && e.touches.length===1) {
        const s = getScreenScale();
        stk.x = startSX+(e.touches[0].clientX-t1x)/s;
        stk.y = startSY+(e.touches[0].clientY-t1y)/s;
        updateBinHighlight();
      } else if (pinching && e.touches.length===2) {
        const s = getScreenScale();
        const a=e.touches[0], b=e.touches[1];
        const d=dist(a.clientX,a.clientY,b.clientX,b.clientY);
        const midX=(a.clientX+b.clientX)/2, midY=(a.clientY+b.clientY)/2;
        stk.scale=Math.max(0.2, startScale*(d/startDist));
        stk.rotation=startRot+(angle(a.clientX,a.clientY,b.clientX,b.clientY)-startAngle)*(180/Math.PI);
        stk.x=startSX+(midX-startMidX)/s;
        stk.y=startSY+(midY-startMidY)/s;
      }
      applyStickerTransform(stk);
    }, { passive:false });

    function finishTouchInteraction(e) {
      if (e.touches.length < 2) pinching=false;
      if (e.touches.length === 0) {
        dragging=false;
        el.classList.remove('stk-dragging');
        if (checkOverTrash()) doDeleteIntoTrash();
        else hideBin();
        endInteraction();
      }
    }

    el.addEventListener('touchend', finishTouchInteraction, { passive:true });
    el.addEventListener('touchcancel', finishTouchInteraction, { passive:true });
  }, [selectSticker, applyStickerTransform, removeSticker]);

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
    el.style.left      = x + 'px';
    el.style.top       = y + 'px';
    el.style.width     = displayW + 'px';
    el.style.transform = 'scale(1) rotate(0deg)';

    if (stickerOverlayRef.current) {
      stickerOverlayRef.current.appendChild(el);
      stickerOverlayRef.current.classList.add('stk-active');
    }
    selectSticker(stk);
    el.addEventListener('click', ev => { ev.stopPropagation(); selectSticker(stk); });
    setupStickerDrag(stk);
  }, [ctxRef, selectSticker, setupStickerDrag]);

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
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.width = bw + 'px';

    if (stickerOverlayRef.current) {
      stickerOverlayRef.current.appendChild(el);
      stickerOverlayRef.current.classList.add('stk-active');
    }
    selectSticker(stk);
    el.addEventListener('click', ev => { ev.stopPropagation(); selectSticker(stk); });
    setupStickerDrag(stk);
  }, [ctxRef, selectSticker, setupStickerDrag]);

  // ── Canvas commit / draw ──
  const commitStickersToCanvas = useCallback(() => {
    const stickers = placedStickersRef.current;
    if (stickers.length === 0) return;
    const ctx = ctxRef.current;
    stickers.forEach(stk => {
      ctx.save();
      if (stk.type === 'text') {
        const eff  = stk.fontSize * stk.scale;
        const maxW = (stk.wrapWidth || stk.baseW) * stk.scale;
        const cx   = stk.x + stk.baseW / 2;
        const cy   = stk.y + stk.baseH / 2;
        ctx.translate(cx, cy);
        ctx.rotate(stk.rotation * Math.PI / 180);
        ctx.font         = `${stk.fontStyle} ${stk.fontWeight} ${eff}px ${stk.fontFamily}`;
        ctx.fillStyle    = stk.color;
        ctx.globalAlpha  = stk.opacity ?? 1;
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur   = 16;
        ctx.textAlign    = stk.textAlign;
        const lines  = wrapCanvasText(ctx, stk.text, maxW);
        const lineH  = eff * 1.22;
        const alignX = stk.textAlign === 'left'  ? -maxW / 2 :
                       stk.textAlign === 'right' ?  maxW / 2 : 0;
        lines.forEach((line, i) => {
          ctx.fillText(line, alignX, (i - (lines.length - 1) / 2) * lineH);
        });
      } else {
        const img = new Image();
        img.src = stk.src;
        const eff = stk.baseW * stk.scale;
        const cx  = stk.x + stk.baseW / 2;
        const cy  = stk.y + (stk.baseH || stk.baseW) / 2;
        ctx.translate(cx, cy);
        ctx.rotate(stk.rotation * Math.PI / 180);
        ctx.drawImage(img, -eff/2, -(eff * (stk.baseH || stk.baseW) / stk.baseW)/2,
          eff, eff * (stk.baseH || stk.baseW) / stk.baseW);
      }
      ctx.restore();
    });
    stickers.forEach(s => s.el.remove());
    placedStickersRef.current = [];
    selectedStickerRef.current = null;
    if (stickerOverlayRef.current) stickerOverlayRef.current.classList.remove('stk-active');
  }, [ctxRef]);

  const drawStickersToContext = useCallback(async (offCtx) => {
    for (const stk of placedStickersRef.current) {
      if (stk.type === 'text') {
        offCtx.save();
        const eff  = stk.fontSize * stk.scale;
        const maxW = (stk.wrapWidth || stk.baseW) * stk.scale;
        const cx   = stk.x + stk.baseW / 2;
        const cy   = stk.y + stk.baseH / 2;
        offCtx.translate(cx, cy);
        offCtx.rotate(stk.rotation * Math.PI / 180);
        offCtx.font         = `${stk.fontStyle} ${stk.fontWeight} ${eff}px ${stk.fontFamily}`;
        offCtx.fillStyle    = stk.color;
        offCtx.globalAlpha  = stk.opacity ?? 1;
        offCtx.textBaseline = 'middle';
        offCtx.shadowColor  = 'rgba(0,0,0,0.5)';
        offCtx.shadowBlur   = 16;
        offCtx.textAlign    = stk.textAlign;
        const lines  = wrapCanvasText(offCtx, stk.text, maxW);
        const lineH  = eff * 1.22;
        const alignX = stk.textAlign === 'left'  ? -maxW / 2 :
                       stk.textAlign === 'right' ?  maxW / 2 : 0;
        lines.forEach((line, i) => {
          offCtx.fillText(line, alignX, (i - (lines.length - 1) / 2) * lineH);
        });
        offCtx.restore();
      } else {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const eff  = stk.baseW * stk.scale;
            const effH = eff * (stk.baseH || stk.baseW) / stk.baseW;
            const cx   = stk.x + stk.baseW / 2;
            const cy   = stk.y + (stk.baseH || stk.baseW) / 2;
            offCtx.save();
            offCtx.translate(cx, cy);
            offCtx.rotate(stk.rotation * Math.PI / 180);
            offCtx.drawImage(img, -eff/2, -effH/2, eff, effH);
            offCtx.restore();
            resolve();
          };
          img.onerror = resolve;
          img.src = stk.src;
        });
      }
    }
  }, []);

  const clearStickers = useCallback(() => {
    placedStickersRef.current.forEach(s => s.el.remove());
    placedStickersRef.current = [];
    selectedStickerRef.current = null;
    if (stickerOverlayRef.current) stickerOverlayRef.current.classList.remove('stk-active');
  }, []);

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
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 4]);
    ctx.beginPath();
    if (nsSelectionModeRef.current === 'circle') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
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
    await new Promise(r => requestAnimationFrame(r));
    const ic = nsImageCanvasRef.current;
    if (!ic) return;
    const w = ic.width, h = ic.height;
    const px = ic.getContext('2d').getImageData(0, 0, w, h).data;

    const inLasso = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (polyContains(x + 0.5, y + 0.5, poly)) inLasso[y * w + x] = 1;
    const lassoArea = inLasso.reduce((a, v) => a + v, 0);

    let mnX = w, mxX = 0, mnY = h, mxY = 0, sumX = 0, sumY = 0;
    poly.forEach(([x, y]) => {
      mnX = Math.min(mnX, x|0); mxX = Math.max(mxX, x|0);
      mnY = Math.min(mnY, y|0); mxY = Math.max(mxY, y|0);
      sumX += x; sumY += y;
    });
    const cenX = sumX / poly.length, cenY = sumY / poly.length;

    function postProcess(subject) {
      const lcc    = keepLargestCC(subject, w, h);
      const morphR = lassoArea > 60000 ? 4 : lassoArea > 15000 ? 2 : 1;
      const closed = morphClose(lcc, w, h, morphR);
      fillHoles(closed, w, h);
      const kept = closed.reduce((a, v) => a + v, 0);
      return (kept > lassoArea * 0.04 && kept < lassoArea * 0.96) ? closed : subject;
    }

    const MAX_PTS = 2000, BG_BAND = 50;
    const bbX0 = Math.max(0, mnX - BG_BAND), bbX1 = Math.min(w-1, mxX + BG_BAND);
    const bbY0 = Math.max(0, mnY - BG_BAND), bbY1 = Math.min(h-1, mxY + BG_BAND);
    const stride = Math.max(1, Math.ceil(Math.sqrt(lassoArea / MAX_PTS)));

    const innerR = Math.min(mxX - mnX, mxY - mnY) * 0.32;
    const fgPts = [], bgPts = [];
    for (let y = bbY0; y <= bbY1; y += stride) {
      for (let x = bbX0; x <= bbX1; x += stride) {
        const i = y*w+x, p = i*4;
        if (px[p+3] === 0) continue;
        const rgb = [px[p], px[p+1], px[p+2]];
        if (inLasso[i] && Math.hypot(x - cenX, y - cenY) <= innerR) {
          if (fgPts.length < MAX_PTS) fgPts.push(rgb);
        } else if (!inLasso[i]) {
          if (bgPts.length < MAX_PTS) bgPts.push(rgb);
        }
      }
    }
    if (fgPts.length < 30) {
      for (let y = bbY0; y <= bbY1; y += stride)
        for (let x = bbX0; x <= bbX1; x += stride) {
          const i = y*w+x, p = i*4;
          if (inLasso[i] && px[p+3] > 0 && fgPts.length < MAX_PTS)
            fgPts.push([px[p], px[p+1], px[p+2]]);
        }
    }
    if (bgPts.length < 80)
      for (let i = 0; i < w*h && bgPts.length < MAX_PTS; i++)
        if (!inLasso[i] && px[i*4+3] > 0) bgPts.push([px[i*4], px[i*4+1], px[i*4+2]]);

    if (!fgPts.length || !bgPts.length) { nsMaskRef.current = inLasso; nsPhase2(); return; }

    const fgAvg = [0,0,0], bgAvg = [0,0,0];
    fgPts.forEach(([r,g,b]) => { fgAvg[0]+=r; fgAvg[1]+=g; fgAvg[2]+=b; });
    bgPts.forEach(([r,g,b]) => { bgAvg[0]+=r; bgAvg[1]+=g; bgAvg[2]+=b; });
    fgAvg[0]/=fgPts.length; fgAvg[1]/=fgPts.length; fgAvg[2]/=fgPts.length;
    bgAvg[0]/=bgPts.length; bgAvg[1]/=bgPts.length; bgAvg[2]/=bgPts.length;
    const colorContrast = sqDist3(fgAvg, bgAvg);

    let keyX = cenX;
    let keyY = cenY;
    let bestKeyScore = Infinity;
    for (let y = bbY0; y <= bbY1; y += stride) {
      for (let x = bbX0; x <= bbX1; x += stride) {
        const i = y*w+x, p = i*4;
        if (!inLasso[i] || px[p+3] === 0) continue;
        const rgb = [px[p], px[p+1], px[p+2]];
        const subjectScore = sqDist3(rgb, fgAvg) - sqDist3(rgb, bgAvg);
        const centerBias = Math.hypot(x - cenX, y - cenY) * 0.08;
        const score = subjectScore + centerBias;
        if (score < bestKeyScore) {
          bestKeyScore = score;
          keyX = x;
          keyY = y;
        }
      }
    }
    const normX = keyX / w, normY = keyY / h;

    // Path A: MediaPipe
    const seg = await nsGetSegmenter();
    if (seg) {
      try {
        const result = seg.segment(ic, { keypoint: { x: normX, y: normY } });
        const conf   = result.confidenceMasks[0].getAsFloat32Array();
        result.close();
        const confThresh = colorContrast > 5000 ? 0.75 : 0.65;
        const subject = new Uint8Array(w * h);
        let kept = 0;
        for (let i = 0; i < w * h; i++) {
          if (inLasso[i] && conf[i] > confThresh) { subject[i] = 1; kept++; }
        }
        if (kept > lassoArea * 0.04 && kept < lassoArea * 0.96) {
          nsMaskRef.current = postProcess(subject);
          nsPhase2();
          return;
        }
      } catch (e) {
        console.warn('[sticker] ML error:', e);
      }
    }

    // Path B: High-contrast fast path
    if (colorContrast >= 5000) {
      const subject = new Uint8Array(w * h);
      for (let i = 0; i < w*h; i++) {
        if (!inLasso[i] || px[i*4+3] === 0) continue;
        const p = i*4, rgb = [px[p], px[p+1], px[p+2]];
        if (sqDist3(rgb, fgAvg) <= sqDist3(rgb, bgAvg)) subject[i] = 1;
      }
      const kept = subject.reduce((a,v) => a+v, 0);
      if (kept > lassoArea * 0.04 && kept < lassoArea * 0.96) {
        nsMaskRef.current = postProcess(subject);
        nsPhase2();
        return;
      }
    }

    // Path C: K-means
    function minDistTo(rgb, centres) {
      let best = Infinity;
      for (const c of centres) { const d = sqDist3(rgb, c); if (d < best) best = d; }
      return best;
    }
    function classify(fgC, bgC) {
      const sub = new Uint8Array(w*h);
      for (let i = 0; i < w*h; i++) {
        if (!inLasso[i] || px[i*4+3] === 0) continue;
        const p = i*4, rgb = [px[p], px[p+1], px[p+2]];
        if (minDistTo(rgb, fgC) <= minDistTo(rgb, bgC)) sub[i] = 1;
      }
      return sub;
    }
    const K = 8, ITER = 20;
    let fgC = kMeans(fgPts, K, ITER), bgC = kMeans(bgPts, K, ITER);
    let subject = classify(fgC, bgC);

    const fgPts2 = [], bgPts2 = [...bgPts];
    for (let y = bbY0; y <= bbY1; y += stride)
      for (let x = bbX0; x <= bbX1; x += stride) {
        const i = y*w+x, p = i*4;
        if (!inLasso[i] || px[p+3] === 0) continue;
        const rgb = [px[p], px[p+1], px[p+2]];
        if (subject[i] && fgPts2.length < MAX_PTS) fgPts2.push(rgb);
        else if (!subject[i] && bgPts2.length < MAX_PTS) bgPts2.push(rgb);
      }
    if (fgPts2.length > K && bgPts2.length > K) {
      fgC = kMeans(fgPts2, K, ITER); bgC = kMeans(bgPts2, K, ITER);
      subject = classify(fgC, bgC);
    }

    nsMaskRef.current = postProcess(subject);
    nsPhase2();
  }, [nsPhase2]);

  // ── NS lasso animation ──
  const nsAnimateLasso = useCallback(() => {
    const lc  = nsLassoCanvasRef.current;
    if (!lc) return;
    const ctx = lc.getContext('2d');
    ctx.clearRect(0, 0, lc.width, lc.height);
    const pts = nsLassoPtsRef.current;
    if (pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth   = 2;
      ctx.setLineDash([7, 4]);
      ctx.lineDashOffset = -nsLassoDashRef.current;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (!nsLassoDownRef.current) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    nsLassoDashRef.current = (nsLassoDashRef.current + 0.5) % 11;
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
      if (nsSelectionModeRef.current === 'freehand') {
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
      if (nsSelectionModeRef.current === 'freehand') {
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
      if (nsSelectionModeRef.current === 'freehand' && valid) {
        if (nsMaskRef.current) {
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
  }, [nsPaintMaskCircle, nsPaintMaskLine, nsPhase2, nsRenderOverlay, nsSetConfirmAvailable]);

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
    nsGetSegmenter(); // warm up ML model
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
    nsSetSelectionMode,
    nsSetRefMode,
    nsHandleOpacityInput,
    // Sticker ops
    placeSticker,
    placeText,
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
  const m = document.querySelector('.frame-container')?.style.transform.match(/scale\(([\d.]+)\)/);
  return m ? parseFloat(m[1]) : 1;
}
