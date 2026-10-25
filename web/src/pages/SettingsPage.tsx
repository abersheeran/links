import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../toast/ToastProvider';
import { api, errorText, jsonBody } from '../lib/api';
import { formatDate, roleLabel } from '../lib/format';

const permissionLabels: Record<string, string> = {
  'links:read': '查看链接',
  'links:write': '管理链接',
  'analytics:read': '查看分析',
  'ai:suggest': 'AI 建议',
  'api_keys:manage': '管理 API Keys',
  'users:manage': '管理团队',
};

export function SettingsPage() {
  const { session } = useAuth();
  const { pushToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }

    setSaving(true);
    try {
      await api<void>('/api/v1/auth/password', {
        method: 'POST',
        body: jsonBody({ currentPassword, newPassword }),
      });
      pushToast('密码已更新，其他会话已失效。', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(errorText(requestError, '密码更新失败。'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content settings-page">
      <PageHeader
        title="账户"
      />

      <section className="settings-grid">
        <article className="panel profile-card">
          <div className="profile-heading">
            <div className="profile-avatar">
              {session?.user.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2>{session?.user.name}</h2>
              <p>{session?.user.email}</p>
            </div>
          </div>
          <dl className="profile-facts">
            <div>
              <dt>角色</dt>
              <dd>{roleLabel(session?.user.role ?? '')}</dd>
            </div>
            <div>
              <dt>租户</dt>
              <dd>{session?.tenant.name}</dd>
            </div>
            <div>
              <dt>会话到期</dt>
              <dd>{formatDate(session?.expiresAt ?? null, true)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>当前权限</h3>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="permission-list">
            {session?.permissions.map((permission) => (
              <span className="permission-chip" key={permission}>
                {permissionLabels[permission] ?? permission}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="panel password-panel">
        <div className="panel-heading">
          <div>
            <h3>修改密码</h3>
          </div>
          <KeyRound size={20} />
        </div>
        <form
          className="password-form"
          onSubmit={(event) => void changePassword(event)}
        >
          <label className="field">
            <span>当前密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          <div className="password-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={saving}
            >
              <UserRound size={15} />
              {saving ? '更新中…' : '更新密码'}
            </button>
          </div>
          {error.length > 0 ? (
            <div className="form-error password-error">{error}</div>
          ) : null}
        </form>
      </section>
    </div>
  );
}
