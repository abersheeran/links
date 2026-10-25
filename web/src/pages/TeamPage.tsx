import {
  LoaderCircle,
  Plus,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../toast/ToastProvider';
import { api, errorText, jsonBody } from '../lib/api';
import { formatDate } from '../lib/format';
import type { TeamUser } from '../lib/types';

interface CreateForm {
  name: string;
  email: string;
  password: string;
  role: 'editor' | 'viewer';
}

const emptyCreateForm: CreateForm = {
  name: '',
  email: '',
  password: '',
  role: 'editor',
};

export function TeamPage() {
  const { pushToast } = useToast();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    setError('');
    api<{ data: TeamUser[] }>('/api/v1/users')
      .then((payload) => setUsers(payload.data))
      .catch((requestError) => {
        setError(errorText(requestError, '团队加载失败。'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setCreateError('');
    try {
      await api<{ data: TeamUser }>('/api/v1/users', {
        method: 'POST',
        body: jsonBody(createForm),
      });
      pushToast('成员已加入团队。', 'success');
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      loadUsers();
    } catch (requestError) {
      setCreateError(errorText(requestError, '创建成员失败。'));
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (
    user: TeamUser,
    payload: { role?: 'editor' | 'viewer'; status?: 'active' | 'disabled' },
  ) => {
    try {
      const updated = await api<{ data: TeamUser }>(
        `/api/v1/users/${user.id}`,
        {
          method: 'PATCH',
          body: jsonBody(payload),
        },
      );
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? updated.data : item)),
      );
      pushToast('成员权限已更新。', 'success');
    } catch (requestError) {
      pushToast(errorText(requestError, '更新失败。'), 'error');
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (resetTarget === null) {
      return;
    }
    setResetting(true);
    setResetError('');
    try {
      await api<void>(`/api/v1/users/${resetTarget.id}/password`, {
        method: 'POST',
        body: jsonBody({ newPassword }),
      });
      pushToast('密码已重置，旧会话已失效。', 'success');
      setResetTarget(null);
      setNewPassword('');
    } catch (requestError) {
      setResetError(errorText(requestError, '重置密码失败。'));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="团队与权限"
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setCreateError('');
              setCreateForm(emptyCreateForm);
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            添加成员
          </button>
        }
      />

      {error.length > 0 ? <div className="form-error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>团队成员</h3>
          </div>
        </div>

        {loading ? (
          <div className="table-loading">正在读取团队…</div>
        ) : (
          <div className="team-table">
            <div className="team-table-head">
              <span>成员</span>
              <span>角色</span>
              <span>状态</span>
              <span>最近登录</span>
              <span aria-label="操作" />
            </div>
            {users.map((user) => (
              <article className="team-row" key={user.id}>
                <div className="member-cell">
                  <div className="avatar avatar-small">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>
                      {user.name}
                      {user.current ? (
                        <span className="you-badge">你</span>
                      ) : null}
                    </strong>
                    <span>{user.email}</span>
                  </div>
                </div>
                <div>
                  {user.role === 'owner' ? (
                    <span className="role-badge role-owner">所有者</span>
                  ) : (
                    <select
                      className="select-compact"
                      value={user.role}
                      onChange={(event) =>
                        void updateUser(user, {
                          role: event.target.value as 'editor' | 'viewer',
                        })
                      }
                    >
                      <option value="editor">编辑者</option>
                      <option value="viewer">只读</option>
                    </select>
                  )}
                </div>
                <div>
                  <span className={`status-badge status-${user.status}`}>
                    {user.status === 'active' ? '正常' : '已停用'}
                  </span>
                </div>
                <span className="link-date">
                  {formatDate(user.lastLoginAt, true)}
                </span>
                <div className="row-actions">
                  {user.role !== 'owner' ? (
                    <>
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => {
                          setResetTarget(user);
                          setNewPassword('');
                          setResetError('');
                        }}
                      >
                        重置密码
                      </button>
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => {
                          if (
                            user.status === 'active' &&
                            !window.confirm(
                              `确认停用 ${user.name}？其现有会话会立即失效。`,
                            )
                          ) {
                            return;
                          }
                          void updateUser(user, {
                            status:
                              user.status === 'active' ? 'disabled' : 'active',
                          });
                        }}
                      >
                        {user.status === 'active' ? '停用' : '恢复'}
                      </button>
                    </>
                  ) : (
                    <span className="mini-note">受保护</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="添加团队成员"
        footer={
          <>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setCreateOpen(false)}
            >
              取消
            </button>
            <button
              className="button button-primary"
              type="submit"
              form="create-user-form"
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Plus size={15} />
              )}
              {saving ? '创建中…' : '创建成员'}
            </button>
          </>
        }
      >
        <form
          id="create-user-form"
          className="form-grid"
          onSubmit={(event) => void createUser(event)}
        >
          <label className="field">
            <span>姓名</span>
            <input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className="field">
            <span>邮箱</span>
            <input
              type="email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className="field">
            <span>初始密码</span>
            <input
              type="password"
              minLength={12}
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className="field">
            <span>角色</span>
            <select
              value={createForm.role}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  role: event.target.value as 'editor' | 'viewer',
                }))
              }
            >
              <option value="editor">编辑者</option>
              <option value="viewer">只读</option>
            </select>
          </label>
          {createError.length > 0 ? (
            <div className="form-error form-span-2">{createError}</div>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={`重置 ${resetTarget?.name ?? ''} 的密码`}
        footer={
          <>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setResetTarget(null)}
            >
              取消
            </button>
            <button
              className="button button-primary"
              type="submit"
              form="reset-password-form"
              disabled={resetting}
            >
              {resetting ? '重置中…' : '重置密码'}
            </button>
          </>
        }
      >
        <form
          id="reset-password-form"
          className="form-grid"
          onSubmit={(event) => void resetPassword(event)}
        >
          <label className="field field-span-2">
            <span>新密码</span>
            <input
              type="password"
              minLength={12}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          {resetError.length > 0 ? (
            <div className="form-error form-span-2">{resetError}</div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
