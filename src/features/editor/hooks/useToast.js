import { useRef, useState, useCallback } from 'react';

/**
 * useToast — lightweight toast notification hook.
 *
 * @param {number} [defaultMs=1800]  Auto-dismiss duration in milliseconds.
 * @returns {{ toastMsg, toastVisible, showToast }}
 */
export function useToast(defaultMs = 1800) {
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const timerRef = useRef(null);

  const showToast = useCallback((msg, ms) => {
    setToastMsg(msg);
    setToastVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastVisible(false), ms ?? defaultMs);
  }, [defaultMs]);

  return { toastMsg, toastVisible, showToast };
}
