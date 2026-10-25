import {
  BarChart3,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Permission } from '../../../shared/permissions';
import { useAuth } from '../auth/AuthProvider';
import { roleLabel } from '../lib/format';

interface NavigationItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  end?: boolean;
}

const navigation: NavigationItem[] = [
  {
    label: '总览',
    path: '/app',
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: '链接',
    path: '/app/links',
    icon: LinkIcon,
    permission: 'links:read',
  },
  {
    label: '分析',
    path: '/app/analytics',
    icon: BarChart3,
    permission: 'analytics:read',
  },
  {
    label: '团队',
    path: '/app/team',
    icon: Users,
    permission: 'users:manage',
  },
  {
    label: 'API Keys',
    path: '/app/api-keys',
    icon: KeyRound,
    permission: 'api_keys:manage',
  },
  {
    label: '设置',
    path: '/app/settings',
    icon: Settings,
  },
];

const pageTitles: Record<string, string> = {
  '/app': '总览',
  '/app/links': '短链接',
  '/app/analytics': '数据分析',
  '/app/team': '团队与权限',
  '/app/api-keys': 'API Keys',
  '/app/settings': '设置',
};

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell() {
  const { session, can, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const pageTitle = pageTitles[location.pathname] ?? '控制台';

  useEffect(() => {
    document.title = `${pageTitle} · Links`;
  }, [pageTitle]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <NavLink
            to="/app"
            className="brand-lockup"
            onClick={() => setMobileOpen(false)}
          >
            <span className="brand-mark">
              <span />
              <span />
            </span>
            <strong>Links</strong>
          </NavLink>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="tenant-stamp">
          <strong>{session?.tenant.name}</strong>
          <code>{session?.tenant.primaryHostname ?? session?.tenant.slug}</code>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          {navigation
            .filter(
              (item) => item.permission === undefined || can(item.permission),
            )
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'nav-item-active' : ''}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{initials(session?.user.name ?? 'L')}</div>
          <div className="sidebar-user-copy">
            <strong>{session?.user.name}</strong>
            <span>{roleLabel(session?.user.role ?? '')}</span>
          </div>
          <button
            className="icon-button sidebar-logout"
            type="button"
            aria-label="退出登录"
            title="退出登录"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label="打开导航"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} />
            </button>
            <span className="topbar-brand">Links</span>
          </div>
        </header>

        <div className="page-stage">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
