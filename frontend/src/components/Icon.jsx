// Inline stroke icons (24×24). Decorative by default.
const PATHS = {
  back: <path d="M15 18l-6-6 6-6" />,
  next: <path d="M9 6l6 6-6 6" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  check: <path d="M5 12l5 5 9-10" />,
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16v.5" /></>),
  share: (<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>),
  pin: (<><path d="M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>),
  up: <path d="M12 20V5M6 11l6-6 6 6" />,
  right: <path d="M5 20v-7a4 4 0 014-4h10M15 5l4 4-4 4" />,
  campus: <path d="M3 10l9-6 9 6M5 10v10h14V10M10 20v-5h4v5" />,
  home: <path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z" />,
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5 6.5-5s5.7 1.5 6.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.3 0 4 1.2 4.6 3.8" /></>),
  activity: (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-5 8-5s6.5 1 8 5" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>),
  calendar: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  down: <path d="M6 9l6 6 6-6" />,
  dot: <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />,
};

export default function Icon({ name, size = 20, color = 'currentColor', width = 2, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
