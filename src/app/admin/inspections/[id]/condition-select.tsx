'use client';

import { useState } from 'react';

const OPTIONS = [
  { value: '', label: 'Not assessed' },
  { value: 'NEW', label: 'New' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
  { value: 'POOR', label: 'Poor' },
  { value: 'DAMAGED', label: 'Damaged' },
];

const COLORS: Record<string, string> = {
  '': 'bg-white text-gray-900 ring-gray-300',
  NEW: 'bg-green-50 text-green-800 ring-green-600/40',
  GOOD: 'bg-blue-50 text-blue-800 ring-blue-600/40',
  FAIR: 'bg-yellow-50 text-yellow-800 ring-yellow-600/40',
  POOR: 'bg-orange-50 text-orange-800 ring-orange-600/40',
  DAMAGED: 'bg-red-50 text-red-800 ring-red-600/40',
};

/** Color-coded condition dropdown for a checklist item (small client leaf). */
export function ConditionSelect({
  id,
  name,
  defaultValue,
}: {
  id?: string;
  name: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={`block w-full rounded-md border-0 px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-brand-600 ${COLORS[value] ?? COLORS['']}`}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
