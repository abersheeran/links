import type { ReactNode } from 'react';

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
      </div>
      {actions !== undefined ? (
        <div className="page-header-actions">{actions}</div>
      ) : null}
    </header>
  );
}
