import React from 'react';
import CollapsedToolbarHandle from './CollapsedToolbarHandle.jsx';
import FloatingToolbar from './FloatingToolbar.jsx';

export default function EditorBottomToolbar({
  children,
  adaptive = false,
  toolbarRef,
  toolbarMode = 'expanded',
  hiddenDuringInteraction = false,
  onCollapse,
  onExpand,
}) {
  const className = [
    'editor-bottom-toolbar',
    adaptive ? 'editor-bottom-toolbar--floating' : '',
    adaptive ? `editor-bottom-toolbar--${toolbarMode}` : '',
    hiddenDuringInteraction ? 'is-hidden-during-interaction' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} aria-label="Editor tools">
      {adaptive ? (
        <>
          <FloatingToolbar
            ref={toolbarRef}
            mode={toolbarMode}
            onCollapse={onCollapse}
          >
            {children}
          </FloatingToolbar>
          <CollapsedToolbarHandle onExpand={onExpand} />
        </>
      ) : children}
    </div>
  );
}
