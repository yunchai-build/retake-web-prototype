import { useState, useCallback } from 'react';
import { buildInviteUrl as buildInviteLink, uploadFrame } from '../../../lib/api.js';

export function useSharePanel({ frameName, showToast, setScrimVisible, getFrameDataUrl }) {
  const [sharePanelVisible, setSharePanelVisible] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  const buildInviteUrl = useCallback(async () => {
    if (!getFrameDataUrl) {
      return `${window.location.origin}/invitee`;
    }

    const frameDataUrl = await getFrameDataUrl();
    const { url } = await uploadFrame({ frameDataUrl, frameName });
    return buildInviteLink({ frameUrl: url, frameName });
  }, [frameName, getFrameDataUrl]);

  const handleCopyLink = useCallback(async () => {
    const code = 'RTKE-' + Math.floor(1000 + Math.random() * 9000);
    try {
      const url = await buildInviteUrl();
      setShareCode(code);
      setShareUrl(url);
      setSharePanelVisible(true);
      setScrimVisible(true);
      await navigator.clipboard?.writeText(url);
      showToast('Invite link copied!');
    } catch(e) {
      console.error('[share] Could not create invite link:', e);
      showToast(e.message || 'Could not create link');
    }
  }, [buildInviteUrl, setScrimVisible, showToast]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard?.writeText(shareUrl || window.location.href).catch(() => {});
    showToast('Invite link copied!');
  }, [shareUrl, showToast]);

  const handleShare = useCallback(async () => {
    const name = frameName || 'My frame';
    try {
      const url = shareUrl || await buildInviteUrl();
      setShareUrl(url);
      if (navigator.share) {
        await navigator.share({ title: name, text: `Step into my Retake frame: ${name}`, url });
      } else {
        await navigator.clipboard?.writeText(url);
        showToast('Invite link copied!');
      }
    } catch(e) {
      if (e.name !== 'AbortError') {
        console.error('[share] Could not share invite link:', e);
        showToast(e.message || 'Could not share link');
      }
    }
  }, [buildInviteUrl, frameName, shareUrl, showToast]);

  return {
    sharePanelVisible, setSharePanelVisible,
    shareCode, shareUrl,
    handleCopyLink, handleCopyCode, handleShare,
  };
}
