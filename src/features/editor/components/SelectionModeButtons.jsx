import React from 'react';

export const SELECTION_MODES = [
  {
    mode: 'freehand',
    label: 'Freehand',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20 Q8 8 12 14 Q16 20 20 6" />
      </svg>
    ),
  },
  {
    mode: 'circle',
    label: 'Circle',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)">
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
  },
  {
    mode: 'rect',
    label: 'Rectangle',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="2" />
      </svg>
    ),
  },
  {
    mode: 'magic',
    label: 'Smart select',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 4V2" />
        <path d="M15 16v-2" />
        <path d="M8 9h2" />
        <path d="M20 9h2" />
        <path d="M17.8 11.8L19 13" />
        <path d="M15 9h0.01" />
        <path d="M17.8 6.2L19 5" />
        <path d="M3 21l9-9" />
        <path d="M12.2 6.2L11 5" />
      </svg>
    ),
  },
];

export function PhotoImportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="M7 16l3.2-3.2 2.6 2.6 1.7-1.7L18 17" />
    </svg>
  );
}

export default function SelectionModeButtons({
  mode,
  onModeClick,
  disabled = false,
  className = '',
  includeImport = false,
  importActive = false,
  onImport,
}) {
  return (
    <div className={`selection-mode-buttons${className ? ` ${className}` : ''}`}>
      {includeImport && (
        <button
          type="button"
          className={`selection-tool-btn${importActive ? ' active' : ''}`}
          aria-label="Choose photo"
          title="Choose photo"
          onClick={onImport}
        >
          <PhotoImportIcon />
        </button>
      )}
      {SELECTION_MODES.map(item => (
        <button
          key={item.mode}
          type="button"
          className={`selection-tool-btn${mode === item.mode ? ' active' : ''}`}
          aria-label={item.label}
          title={item.label}
          disabled={disabled}
          onClick={() => onModeClick(item.mode)}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
