import React from 'react';

const iconProps = {
  className: 'tool-icon-svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export default function ToolIcon({ type }) {
  let icon = null;

  switch (type) {
    case 'text':
      icon = (
        <svg {...iconProps}>
          <path d="M4.25 5.25h15.5" />
          <path d="M12 5.25v13.5" />
          <path d="M8.5 18.75h7" />
        </svg>
      );
      break;
    case 'stickers':
      icon = (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="7.75" />
          <path d="M8.75 14.15c.85 1.05 1.9 1.55 3.25 1.55s2.4-.5 3.25-1.55" />
          <path d="M9.25 9.6h.01" />
          <path d="M14.75 9.6h.01" />
        </svg>
      );
      break;
    case 'photo':
      icon = (
        <svg {...iconProps}>
          <rect x="4.25" y="5.25" width="15.5" height="13.5" rx="2.2" />
          <circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none" />
          <path d="M4.75 18.25l5.3-5.4 3.1 3.2 2.25-2.4 3.85 4.6" />
        </svg>
      );
      break;
    case 'draw':
      icon = (
        <svg {...iconProps}>
          <path d="M15.55 4.8a2.45 2.45 0 0 1 3.45 3.45L8.45 18.8l-3.95.35.35-3.95L15.55 4.8z" />
          <path d="M13.85 6.5l3.45 3.45" />
        </svg>
      );
      break;
    case 'eraser':
      icon = (
        <svg {...iconProps}>
          <defs>
            <clipPath id="transparent-brush-clip">
              <circle cx="12" cy="12" r="7.75" />
            </clipPath>
          </defs>
          <g clipPath="url(#transparent-brush-clip)" stroke="none">
            <rect x="4.25" y="4.25" width="15.5" height="15.5" fill="#ffffff" opacity="0.96" />
            <rect x="4.25" y="4.25" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="12" y="4.25" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="8.125" y="8.125" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="15.875" y="8.125" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="4.25" y="12" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="12" y="12" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="8.125" y="15.875" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
            <rect x="15.875" y="15.875" width="3.875" height="3.875" fill="#9aa3ad" opacity="0.92" />
          </g>
          <circle cx="12" cy="12" r="7.75" />
        </svg>
      );
      break;
    case 'save':
      icon = (
        <svg {...iconProps}>
          <path d="M12 4.25v10.25" />
          <path d="m7.75 10.25 4.25 4.25 4.25-4.25" />
          <path d="M4.25 19.75h15.5" />
        </svg>
      );
      break;
    case 'close':
      icon = (
        <svg {...iconProps}>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </svg>
      );
      break;
    case 'check':
      icon = (
        <svg {...iconProps}>
          <path d="M5 12.5 9.6 17 19 7" />
        </svg>
      );
      break;
    case 'undo':
      icon = (
        <svg {...iconProps}>
          <path d="M8 11H4V7" />
          <path d="M4 11c2.25-3 5.55-4.35 9-3.45 4.65 1.15 7.25 5.45 6.1 9.7" />
        </svg>
      );
      break;
    case 'redo':
      icon = (
        <svg {...iconProps}>
          <path d="M16 11h4V7" />
          <path d="M20 11c-2.25-3-5.55-4.35-9-3.45-4.65 1.15-7.25 5.45-6.1 9.7" />
        </svg>
      );
      break;
    case 'arrowRight':
      icon = (
        <svg {...iconProps}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
      break;
    case 'arrowLeft':
      icon = (
        <svg {...iconProps}>
          <path d="M19 12H5" />
          <path d="m11 6-6 6 6 6" />
        </svg>
      );
      break;
    case 'chevron':
      icon = (
        <svg {...iconProps} viewBox="0 0 24 24">
          <path d="m7 10 5 5 5-5" />
        </svg>
      );
      break;
    default:
      return null;
  }

  return (
    <span className={`tool-icon-frame tool-icon-frame-${type}`} aria-hidden="true">
      {icon}
    </span>
  );
}
