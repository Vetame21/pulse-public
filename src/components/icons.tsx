// Small line icons in the same stroke style as the bottom navigation.
// Decorative by default (aria-hidden): always pair them with visible text.

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export const ClassIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z" />
    <path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11M21.5 9v5" />
  </Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);
export const EventIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const DeadlineIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9.5V13l2.5 1.5M9.5 2.5h5" />
  </Svg>
);
export const CakeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20.5h16M5 20.5v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
    <path d="M5 15.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0M12 11.5V8M12 5.5c.8-.7.8-1.5 0-2.5-.8 1-.8 1.8 0 2.5z" />
  </Svg>
);
export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h13v4" />
    <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" />
    <path d="M16 14.5h.01" />
  </Svg>
);
export const ExpenseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10M12 4v16M8.5 9.5h7M8.5 13.5h7M8 20l4-6.5L16 20" />
  </Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);
export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
);
export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const NoticeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);
export const GoalIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
);
