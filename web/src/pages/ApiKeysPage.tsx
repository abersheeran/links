import { Copy, KeyRound, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../toast/ToastProvider';
import { api, errorText, jsonBody } from '../lib/api';
import { formatDate } from '../lib/format';
import type { ApiKeyItem } from '../lib/types';

export function ApiKeysPage() {
  const { pushToast } = useToast();
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const loadKeys = () => {
    setLoading(true);
    setError('');
    api<{ data: ApiKeyItem[] }>('/api/v1/api-keys')
      .then((payload) => setKeys(payload.data))
      .catch((requestError) => {
        setError(errorText(requestError, 'API Key 加载失败。'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const createKey = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const payload = await api<{
        data: {
          id: string;
          name: string;
          prefix: string;
          token: string;
          createdAt: string;
        };
      }>('/api/v1/api-keys', {
        method: 'POST',
        body: jsonBody({ name: keyName }),
      });
      setCreateOpen(false);
      setKeyName('');
      setCreatedToken(payload.data.token);
      loadKeys();
    } catch (requestError) {
      setCreateError(errorText(requestError, '创建 API Key 失败。'));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key: ApiKeyItem) => {
    if (!window.confirm(`确认撤销 API Key “${key.name}”？`)) {
      return;
    }
    try {
      await api<void>(`/api/v1/api-keys/${key.id}`, { method: 'DELETE' });
      pushToast('API Key 已撤销。', 'success');
      loadKeys();
    } catch (requestError) {
      pushToast(errorText(requestError, '撤销失败。'), 'error');
    }
  };

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      pushToast('Token 已复制。', 'success');
    } catch {
      pushToast('浏览器未允许剪贴板访问。', 'error');
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="API Keys"
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setCreateError('');
              setKeyName('');
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            新建 Key
          </button>
        }
      />

      {error.length > 0 ? <div className="form-error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>租户 API Keys</h3>
          </div>
        </div>

        {loading ? (
          <div className="table-loading">正在读取 API Keys…</div>
        ) : keys.length === 0 ? (
          <div className="empty-state">
            <KeyRound size={26} />
            <h3>还没有 API Key。</h3>
          </div>
        ) : (
          <div className="key-list">
            {keys.map((key) => (
              <article
                className={`key-row ${key.revokedAt !== null ? 'key-row-revoked' : ''}`}
                key={key.id}
              >
                <div className="key-icon">
                  <KeyRound size={17} />
                </div>
                <div className="key-copy">
                  <div>
                    <strong>{key.name}</strong>
                    {key.current ? (
                      <span className="you-badge">当前</span>
                    ) : null}
                    {key.revokedAt !== null ? (
                      <span className="status-badge status-disabled">
                        已撤销
                      </span>
                    ) : null}
                  </div>
                  <code>lnk_{key.prefix}_••••••••</code>
                </div>
                <div className="key-meta">
                  <span>创建于 {formatDate(key.createdAt, true)}</span>
                  <span>
                    最近使用{' '}
                    {key.lastUsedAt === null
                      ? '从未'
                      : formatDate(key.lastUsedAt, true)}
                  </span>
                </div>
                <div className="row-actions">
                  {key.revokedAt === null ? (
                    <button
                      className="button button-ghost button-small danger"
                      type="button"
                      onClick={() => void revoke(key)}
                    >
                      撤销
                    </button>
                  ) : (
                    <span className="mini-note">不可用</span>
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
        title="创建 API Key"
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
              form="create-key-form"
              disabled={creating}
            >
              {creating ? '创建中…' : '创建 Key'}
            </button>
          </>
        }
      >
        <form
          id="create-key-form"
          className="form-grid"
          onSubmit={(event) => void createKey(event)}
        >
          <label className="field field-span-2">
            <span>名称</span>
            <input
              value={keyName}
              placeholder="Production API"
              onChange={(event) => setKeyName(event.target.value)}
              required
            />
          </label>
          {createError.length > 0 ? (
            <div className="form-error form-span-2">{createError}</div>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={createdToken !== null}
        onClose={() => setCreatedToken(null)}
        title="API Key 已创建"
        footer={
          <button
            className="button button-primary"
            type="button"
            onClick={() => setCreatedToken(null)}
          >
            我已保存
          </button>
        }
      >
        <div className="token-reveal">
          <code>{createdToken}</code>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => {
              if (createdToken !== null) {
                void copyToken(createdToken);
              }
            }}
          >
            <Copy size={15} /> 复制 Token
          </button>
        </div>
      </Modal>
    </div>
  );
}
