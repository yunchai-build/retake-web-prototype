import React from 'react';

export default function EditorHeader({ children }) {
  return (
    <header className="editor-header header-controls" aria-label="Editor controls">
      {children}
    </header>
  );
}
