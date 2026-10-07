import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const SendIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12 3.5 4.6a.6.6 0 0 1 .85-.67l16 7.5a.6.6 0 0 1 0 1.1l-16 7.5a.6.6 0 0 1-.85-.67L5 12Zm0 0h7" />
  </svg>
);

export const BackIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ReplyIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const LogoutIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </svg>
);

export const SunIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
  </svg>
);

export const AutoThemeIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
  </svg>
);

export const EyeIcon = ({ off, ...p }: P & { off?: boolean }) => (
  <svg {...base} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

export const AlertIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2v.3" />
  </svg>
);

export const RetryIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </svg>
);

export const ArrowDownIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const ChevronIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** One tick = sent, two = delivered, two blue = read, clock = pending. */
export const Ticks = ({ double }: { double: boolean }) => (
  <svg width="17" height="11" viewBox="0 0 17 11" fill="none" aria-hidden>
    <path d="M1 5.8 4.3 9 11 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    {double && (
      <path d="M7.6 8.4 8.3 9 15 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/** App mark: a speech bubble on a blue gradient (deliberately not the Telegram logo). */
export const AppLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <defs>
      <linearGradient id="applogo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4FB0F8" />
        <stop offset="1" stopColor="#2A7FDC" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="32" fill="url(#applogo)" />
    <path
      d="M20 22h24a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5H31l-8 6v-6h-3a5 5 0 0 1-5-5V27a5 5 0 0 1 5-5Z"
      fill="#fff"
    />
    <circle cx="25" cy="32.5" r="2.4" fill="#2A7FDC" />
    <circle cx="32" cy="32.5" r="2.4" fill="#2A7FDC" />
    <circle cx="39" cy="32.5" r="2.4" fill="#2A7FDC" />
  </svg>
);
