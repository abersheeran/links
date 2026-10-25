import { Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="state-icon">
        <LinkIcon size={20} />
      </div>
      <span className="eyebrow">404</span>
      <h1>页面不存在。</h1>
      <Link className="button button-primary" to="/app">
        回到控制台
      </Link>
    </main>
  );
}
