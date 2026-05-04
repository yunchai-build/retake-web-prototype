import { useState, useRef, useCallback } from 'react';

export function useConfirmDialog() {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmScrimVisible, setConfirmScrimVisible] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [confirmOkLabel, setConfirmOkLabel] = useState('');
  const [confirmDanger, setConfirmDanger] = useState(false);
  const confirmResolveRef = useRef(null);

  const showConfirm = useCallback((message, okLabel, isDanger) => {
    return new Promise(resolve => {
      setConfirmMsg(message);
      setConfirmOkLabel(okLabel);
      setConfirmDanger(isDanger);
      setConfirmScrimVisible(true);
      setConfirmVisible(true);
      confirmResolveRef.current = resolve;
    });
  }, []);

  const dismissConfirm = useCallback((val) => {
    setConfirmScrimVisible(false);
    setConfirmVisible(false);
    if (confirmResolveRef.current) {
      confirmResolveRef.current(val);
      confirmResolveRef.current = null;
    }
  }, []);

  return {
    confirmVisible, confirmScrimVisible, confirmMsg, confirmOkLabel, confirmDanger,
    showConfirm, dismissConfirm,
  };
}
