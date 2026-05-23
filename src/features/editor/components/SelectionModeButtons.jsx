import React from 'react';

export const SELECTION_MODES = [
  {
    mode: 'freehand',
    // Now behaves as a Loop: drawn path is closed into a polygon and the
    // *interior* becomes the sticker. The icon shows a closed loop to hint at
    // that — the previous wavy stroke implied freeform pen strokes (the new
    // `pen` mode below covers that case manually).
    label: 'Draw the sticker edge by hand',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12c0-4 3-7 7-7s7 3 7 7-3 7-7 7c-2 0-3-1-3-2s1-2 2-2" />
      </svg>
    ),
  },
  {
    mode: 'pen',
    // Manual pen — paint the mask pixel by pixel (the old freehand behavior).
    // Lives next to Freehand so users have both choices: quick lasso vs.
    // precise manual outline.
    label: 'Pen — paint manually',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="var(--icon-stroke-width)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21l3-1 11-11-3-3L3 17v4z" />
        <path d="M14 4l3 3" />
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
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <path d="M42.5666 35.5242C38.69 36.7722 36.4523 39.3476 35.3316 42.9999C35.0896 43.7885 34.8983 44.6802 34.3932 45.2799C33.6515 46.1606 32.6486 47.4079 31.7568 47.4081C30.8895 47.4083 29.8829 46.1394 29.1971 45.2315C28.62 44.4675 28.3574 43.4402 28.057 42.4972C26.9066 38.8848 24.4622 36.6353 20.8977 35.4869C19.7994 35.133 18.6837 34.7557 17.6803 34.2004C15.3224 32.8958 15.3314 30.7528 17.6814 29.4262C18.5392 28.942 19.479 28.5574 20.4269 28.286C24.5257 27.1121 27.0292 24.4173 28.3932 20.4316C29.0051 18.6438 29.173 16.1068 31.7407 16.05C34.3685 15.9919 34.5594 18.5696 35.1493 20.3384C36.5212 24.4523 39.1387 27.1468 43.2955 28.3536C43.5341 28.4229 43.7987 28.4329 44.0157 28.5414C45.5168 29.2925 47.8974 29.631 47.4137 31.7969C47.1364 33.0386 45.3205 33.9639 44.1366 34.9595C43.7803 35.2591 43.2202 35.3164 42.5666 35.5242Z" fill="white" fillOpacity="0.819608" />
        <path d="M2.93326 15.0591C0.798638 13.0188 0.91909 11.2903 3.44224 10.5528C7.24355 9.44176 9.46478 7.15017 10.5978 3.43511C10.8466 2.61909 12.0186 1.59608 12.7974 1.56844C13.5663 1.54114 14.8492 2.50979 15.0871 3.29109C16.248 7.10276 18.5441 9.5112 22.4251 10.5958C23.2509 10.8266 24.3921 12.1309 24.3186 12.828C24.2239 13.7276 23.1861 15.0415 22.3235 15.2584C18.4312 16.2368 16.308 18.695 15.1416 22.3874C14.8769 23.2252 13.6176 24.407 12.9825 24.3125C12.0754 24.1775 10.8226 23.145 10.5881 22.2641C9.52775 18.2807 6.84985 16.2012 2.93326 15.0591Z" fill="white" fillOpacity="0.819608" />
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
  modes = SELECTION_MODES.map(item => item.mode),
  includeImport = false,
  importActive = false,
  onImport,
}) {
  const visibleModes = SELECTION_MODES.filter(item => modes.includes(item.mode));

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
      {visibleModes.map(item => (
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
