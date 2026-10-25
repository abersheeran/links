import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <section className="state-page">
      <div className="state-icon">
        <ShieldX size={20} />
      </div>
      <span className="eyebrow">403</span>
      <h2>当前角色没有访问权限</h2>
      <Link className="button button-secondary" to="/app">
        返回总览
      </Link>
    </section>
  );
}
