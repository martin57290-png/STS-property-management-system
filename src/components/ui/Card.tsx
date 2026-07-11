import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white shadow-sm ${padded ? 'p-4 sm:p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-base font-semibold text-gray-900 ${className}`}>{children}</h2>;
}

export function CardSection({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title ? <CardTitle>{title}</CardTitle> : <span />}
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}
