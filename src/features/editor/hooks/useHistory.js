import { useState, useRef, useCallback } from 'react';

export function useHistory({ canvasRef, ctxRef, activeToolRef, showToast }) {
  const mainUndoStackRef = useRef([]);
  const mainRedoStackRef = useRef([]);
  const toolUndoStackRef = useRef([]);
  const toolRedoStackRef = useRef([]);
  const sessionEntrySnapRef = useRef(null);

  const [undoBtnDisabled, setUndoBtnDisabled] = useState(true);
  const [redoBtnDisabled, setRedoBtnDisabled] = useState(true);
  const [tmUndoBtnDisabled, setTmUndoBtnDisabled] = useState(true);
  const [tmRedoBtnDisabled, setTmRedoBtnDisabled] = useState(true);

  const snapshot = useCallback(() => {
    try { return canvasRef.current.toDataURL(); } catch(e) { return null; }
  }, [canvasRef]);

  const restoreSnapshot = useCallback((url) => {
    if (!url) return Promise.resolve();
    return new Promise(res => {
      const i = new Image();
      i.onload = () => {
        const ctx = ctxRef.current;
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(i, 0, 0);
        res();
      };
      i.src = url;
    });
  }, [ctxRef]);

  const syncHistoryBtns = useCallback(() => {
    if (activeToolRef.current) {
      setTmUndoBtnDisabled(toolUndoStackRef.current.length <= 1);
      setTmRedoBtnDisabled(toolRedoStackRef.current.length === 0);
      setUndoBtnDisabled(true);
      setRedoBtnDisabled(true);
    } else {
      setUndoBtnDisabled(mainUndoStackRef.current.length <= 1);
      setRedoBtnDisabled(mainRedoStackRef.current.length === 0);
      setTmUndoBtnDisabled(true);
      setTmRedoBtnDisabled(true);
    }
  }, [activeToolRef]);

  const pushHistory = useCallback(() => {
    if (activeToolRef.current) {
      if (toolUndoStackRef.current.length >= 30) toolUndoStackRef.current.shift();
      toolUndoStackRef.current.push(snapshot());
      toolRedoStackRef.current = [];
    } else {
      mainUndoStackRef.current.push(snapshot());
      mainRedoStackRef.current = [];
    }
    syncHistoryBtns();
  }, [activeToolRef, snapshot, syncHistoryBtns]);

  const toolUndo = useCallback(async () => {
    if (toolUndoStackRef.current.length <= 1) { showToast('Nothing to undo'); return; }
    toolRedoStackRef.current.push(toolUndoStackRef.current.pop());
    await restoreSnapshot(toolUndoStackRef.current[toolUndoStackRef.current.length - 1]);
    syncHistoryBtns();
  }, [showToast, restoreSnapshot, syncHistoryBtns]);

  const toolRedo = useCallback(async () => {
    if (!toolRedoStackRef.current.length) { showToast('Nothing to redo'); return; }
    const snap = toolRedoStackRef.current.pop();
    toolUndoStackRef.current.push(snap);
    await restoreSnapshot(snap);
    syncHistoryBtns();
  }, [showToast, restoreSnapshot, syncHistoryBtns]);

  const mainUndo = useCallback(async () => {
    if (mainUndoStackRef.current.length <= 1) { showToast('Nothing to undo'); return; }
    const current = mainUndoStackRef.current.pop();
    mainRedoStackRef.current.push(current);
    await restoreSnapshot(mainUndoStackRef.current[mainUndoStackRef.current.length - 1]);
    syncHistoryBtns();
  }, [showToast, restoreSnapshot, syncHistoryBtns]);

  const mainRedo = useCallback(async () => {
    if (!mainRedoStackRef.current.length) { showToast('Nothing to redo'); return; }
    const snap = mainRedoStackRef.current.pop();
    mainUndoStackRef.current.push(snap);
    await restoreSnapshot(snap);
    syncHistoryBtns();
  }, [showToast, restoreSnapshot, syncHistoryBtns]);

  return {
    mainUndoStackRef, mainRedoStackRef,
    toolUndoStackRef, toolRedoStackRef,
    sessionEntrySnapRef,
    undoBtnDisabled, redoBtnDisabled,
    tmUndoBtnDisabled, tmRedoBtnDisabled,
    snapshot, restoreSnapshot, syncHistoryBtns, pushHistory,
    mainUndo, mainRedo, toolUndo, toolRedo,
  };
}
