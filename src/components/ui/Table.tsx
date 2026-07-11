import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>;
}

export function Th({
  children,
  className = '',
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={`px-3 py-2.5 align-top text-gray-800 ${className}`} {...props}>
      {children}
    </td>
  );
}
