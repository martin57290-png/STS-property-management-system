import type { ReactNode } from 'react';

export type BadgeTone =
  | 'gray'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple';

const TONES: Record<BadgeTone, string> = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-600/30',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20',
};

export function Badge({
  tone = 'gray',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
