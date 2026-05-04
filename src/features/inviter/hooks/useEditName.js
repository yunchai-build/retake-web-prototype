import { useState, useCallback } from 'react';

export function useEditName({ frameName, setFrameName, setScrimVisible }) {
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editNameInputValue, setEditNameInputValue] = useState('');

  const openEditName = useCallback(() => {
    setEditNameInputValue(frameName);
    setEditNameVisible(true);
    setScrimVisible(true);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => {
      const inp = document.getElementById('editNameInput');
      if (inp) { inp.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    }, 60);
  }, [frameName, setScrimVisible]);

  const saveEditName = useCallback(() => {
    if (editNameInputValue.trim()) setFrameName(editNameInputValue.trim());
    setEditNameVisible(false);
    setScrimVisible(false);
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, 0);
  }, [editNameInputValue, setFrameName, setScrimVisible]);

  return {
    editNameVisible, editNameInputValue, setEditNameInputValue,
    openEditName, saveEditName,
  };
}
