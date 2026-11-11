// The handful of icons the interface needs, drawn on a 24 px grid.

const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bolt: <path d="M13.5 2.5L5 13.5h6l-1.5 8L19 10.5h-6.2l.7-8z" fill="currentColor" stroke="none" />,
  dots: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  swap: <path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5" />,
  pin: <path d="M9 3.5h6l-1 6.5 3 3v2H7v-2l3-3-1-6.5zM12 15v5.5" />,
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
