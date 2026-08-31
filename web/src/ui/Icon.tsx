// Hairline line-icons. 20×20, 1.6 stroke, currentColor. Kept minimal on purpose.
import type { ReactNode } from 'react';

type IconName = 'check' | 'loop' | 'close' | 'plus' | 'pin' | 'arrow' | 'undo';

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M4 10.5l4 4 8-9" />,
  loop: (
    <>
      <path d="M4.5 9a5.5 5.5 0 0 1 9.4-3.9L16 7" />
      <path d="M15.5 11a5.5 5.5 0 0 1-9.4 3.9L4 13" />
      <path d="M16 3.5V7h-3.5M4 16.5V13h3.5" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5L5 15" />,
  plus: <path d="M10 4v12M4 10h12" />,
  pin: (
    <>
      <path d="M10 17s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9z" />
      <circle cx="10" cy="8" r="1.6" />
    </>
  ),
  arrow: <path d="M4 10h11M11 5.5l4.5 4.5L11 14.5" />,
  undo: <path d="M8 5L4 9l4 4M4 9h7a4.5 4.5 0 0 1 0 9H8" />,
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
