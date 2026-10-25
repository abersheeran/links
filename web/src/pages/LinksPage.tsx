import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../toast/ToastProvider';
import { api, errorText, jsonBody } from '../lib/api';
import { formatDate } from '../lib/format';
import type { LinkItem, LinkListResponse } from '../lib/types';

interface LinkFormState {
  targetUrl: string;
  code: string;
  title: string;
  description: string;
  tags: string;
  expiresAt: string;
  status: 'active' | 'disabled';
}

const emptyForm: LinkFormState = {
  targetUrl: '',
  code: '',
  title: '',
  description: '',
  tags: '',
  expiresAt: '',
  status: 'active',
};

function toDateTimeLocal(value: string | null): string {
  if (value === null) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }
  return new Date(value).toISOString();
}

export function LinksPage() {
  const { can } = useAuth();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [status, setStatus] = useState<'' | 'active' | 'disabled'>('');
  const [queryDraft, setQueryDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LinkItem | null>(null);
  const [form, setForm] = useState<LinkFormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const cursor = cursorStack.at(-1) ?? null;

  const loadLinks = () => {
    const params = new URLSearchParams({ limit: '25' });
    if (cursor !== null) {
      params.set('cursor', cursor);
    }
    if (status !== '') {
      params.set('status', status);
    }
    if (appliedQuery.length > 0) {
      params.set('q', appliedQuery);
    }

    setLoading(true);
    setError('');
    api<LinkListResponse>(`/api/v1/links?${params.toString()}`)
      .then((payload) => {
        setLinks(payload.data);
        setTotal(payload.pagination.total);
        setNextCursor(payload.pagination.nextCursor);
      })
      .catch((requestError) => {
        setError(errorText(requestError, '链接加载失败。'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLinks();
    // loadLinks intentionally follows the current filter state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, status, appliedQuery]);

  const resetForm = (link?: LinkItem) => {
    setFormError('');
    if (link === undefined) {
      setEditing(null);
      setForm(emptyForm);
      return;
    }
    setEditing(link);
    setForm({
      targetUrl: link.targetUrl,
      code: link.code,
      title: link.title ?? '',
      description: link.description ?? '',
      tags: link.tags.join(', '),
      expiresAt: toDateTimeLocal(link.expiresAt),
      status: link.status,
    });
  };

  useEffect(() => {
    if (searchParams.get('new') === '1' && can('links:write')) {
      resetForm();
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [can, searchParams, setSearchParams]);

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (link: LinkItem) => {
    resetForm(link);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) {
      return;
    }
    setFormOpen(false);
    setEditing(null);
  };

  const suggest = async () => {
    if (form.targetUrl.trim().length === 0) {
      setFormError('先填写目标 URL，再生成建议。');
      return;
    }
    setSuggesting(true);
    setFormError('');
    try {
      const payload = await api<{
        data: {
          title: string;
          description: string;
          tags: string[];
          codes: string[];
          source: 'ai' | 'fallback';
        };
      }>('/api/v1/ai/suggest', {
        method: 'POST',
        body: jsonBody({ url: form.targetUrl }),
      });
      setForm((current) => ({
        ...current,
        title: current.title || payload.data.title,
        description: current.description || payload.data.description,
        tags:
          current.tags.length > 0 ? current.tags : payload.data.tags.join(', '),
        code: current.code || payload.data.codes[0] || '',
      }));
      pushToast(
        payload.data.source === 'ai'
          ? 'AI 建议已填入表单。'
          : 'AI 暂不可用，已使用 URL 降级建议。',
        payload.data.source === 'ai' ? 'success' : 'info',
      );
    } catch (requestError) {
      setFormError(errorText(requestError, '生成建议失败。'));
    } finally {
      setSuggesting(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const expiresAt = fromDateTimeLocal(form.expiresAt);

    try {
      if (editing === null) {
        await api<{ data: LinkItem }>('/api/v1/links', {
          method: 'POST',
          body: jsonBody({
            targetUrl: form.targetUrl,
            ...(form.code.trim().length > 0 ? { code: form.code.trim() } : {}),
            ...(form.title.trim().length > 0
              ? { title: form.title.trim() }
              : {}),
            ...(form.description.trim().length > 0
              ? { description: form.description.trim() }
              : {}),
            tags,
            ...(expiresAt === undefined ? {} : { expiresAt }),
          }),
        });
        pushToast('短链接已创建。', 'success');
      } else {
        await api<{ data: LinkItem }>(`/api/v1/links/${editing.id}`, {
          method: 'PATCH',
          body: jsonBody({
            targetUrl: form.targetUrl,
            title: form.title.trim().length === 0 ? null : form.title.trim(),
            description:
              form.description.trim().length === 0
                ? null
                : form.description.trim(),
            tags,
            status: form.status,
            expiresAt: expiresAt ?? null,
          }),
        });
        pushToast('短链接已更新。', 'success');
      }
      setFormOpen(false);
      setEditing(null);
      if (cursorStack.length === 1) {
        loadLinks();
      } else {
        setCursorStack([null]);
      }
    } catch (requestError) {
      setFormError(errorText(requestError, '保存失败，请检查输入。'));
    } finally {
      setSaving(false);
    }
  };

  const deleteLink = async (link: LinkItem) => {
    if (!window.confirm(`确认删除 /${link.code}？这个操作不可撤销。`)) {
      return;
    }
    try {
      await api<void>(`/api/v1/links/${link.id}`, { method: 'DELETE' });
      pushToast('短链接已删除。', 'success');
      if (cursorStack.length === 1) {
        loadLinks();
      } else {
        setCursorStack([null]);
      }
    } catch (requestError) {
      pushToast(errorText(requestError, '删除失败。'), 'error');
    }
  };

  const copy = async (link: LinkItem) => {
    if (link.shortUrl === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      pushToast('短链接已复制。', 'success');
    } catch {
      pushToast('浏览器未允许剪贴板访问。', 'error');
    }
  };

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setCursorStack([null]);
    setAppliedQuery(queryDraft.trim());
  };

  return (
    <div className="page-content">
      <PageHeader
        title="短链接"
        actions={
          can('links:write') ? (
            <button
              className="button button-primary"
              type="button"
              onClick={openCreate}
            >
              <Plus size={16} />
              新建链接
            </button>
          ) : null
        }
      />

      <section className="panel links-panel">
        <div className="toolbar">
          <form className="search-box" onSubmit={applySearch}>
            <Search size={16} />
            <input
              type="search"
              placeholder="搜索短码、标题或目标 URL"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <button
              className="button button-secondary button-small"
              type="submit"
            >
              搜索
            </button>
          </form>
          <div className="toolbar-right">
            <select
              className="select-compact"
              value={status}
              onChange={(event) => {
                setCursorStack([null]);
                setStatus(event.target.value as '' | 'active' | 'disabled');
              }}
              aria-label="筛选链接状态"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
            <span className="result-count">{total} 条链接</span>
          </div>
        </div>

        {error.length > 0 ? <div className="form-error">{error}</div> : null}

        {loading ? (
          <div className="table-loading">正在读取链接…</div>
        ) : links.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-mark">↗</span>
            <h3>这里还没有链接。</h3>
            {can('links:write') ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={openCreate}
              >
                <Plus size={15} /> 新建链接
              </button>
            ) : null}
          </div>
        ) : (
          <div className="link-table">
            <div className="link-table-head">
              <span>链接</span>
              <span>目标</span>
              <span>标签</span>
              <span>状态</span>
              <span>创建时间</span>
              <span aria-label="操作" />
            </div>
            {links.map((link) => (
              <article className="link-row" key={link.id}>
                <div className="link-primary">
                  <div className="link-code-line">
                    <code>/{link.code}</code>
                  </div>
                  <strong>{link.title ?? '未命名链接'}</strong>
                </div>
                <a
                  className="target-link"
                  href={link.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={link.targetUrl}
                >
                  <span>{link.targetUrl}</span>
                  <ExternalLink size={13} />
                </a>
                <div className="tag-line link-tags">
                  {link.tags.slice(0, 3).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="link-status">
                  <span className={`status-badge status-${link.status}`}>
                    {link.status === 'active' ? '启用' : '停用'}
                  </span>
                  {link.expired ? (
                    <span className="mini-note">已过期</span>
                  ) : null}
                </div>
                <span className="link-date">
                  {formatDate(link.createdAt, true)}
                </span>
                <div className="row-actions">
                  {link.shortUrl !== null ? (
                    <button
                      className="icon-button icon-button-small"
                      type="button"
                      title="复制短链接"
                      aria-label="复制短链接"
                      onClick={() => void copy(link)}
                    >
                      <Copy size={13} />
                    </button>
                  ) : null}
                  {can('links:write') ? (
                    <>
                      <button
                        className="icon-button icon-button-small"
                        type="button"
                        title="编辑"
                        aria-label="编辑链接"
                        onClick={() => openEdit(link)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button icon-button-small danger"
                        type="button"
                        title="删除"
                        aria-label="删除链接"
                        onClick={() => void deleteLink(link)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="mini-note">只读</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="table-footer">
          <span>
            第 {links.length === 0 ? 0 : cursorStack.length} 页 · 共 {total} 条
          </span>
          <div className="pager">
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={cursorStack.length <= 1}
              onClick={() => setCursorStack((current) => current.slice(0, -1))}
            >
              <ChevronLeft size={14} /> 上一页
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={nextCursor === null}
              onClick={() =>
                setCursorStack((current) => [...current, nextCursor])
              }
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing === null ? '创建短链接' : `编辑 /${editing.code}`}
        wide
        footer={
          <>
            <button
              className="button button-secondary"
              type="button"
              onClick={closeForm}
            >
              取消
            </button>
            <button
              className="button button-primary"
              type="submit"
              form="link-form"
              disabled={saving}
            >
              {saving ? '保存中…' : editing === null ? '创建链接' : '保存修改'}
            </button>
          </>
        }
      >
        <form
          id="link-form"
          className="form-grid"
          onSubmit={(event) => void save(event)}
        >
          <label className="field field-span-2">
            <span>目标 URL</span>
            <input
              type="url"
              placeholder="https://example.com/landing"
              value={form.targetUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  targetUrl: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className="field">
            <span>短码</span>
            <input
              type="text"
              placeholder="launch-2026"
              value={form.code}
              readOnly={editing !== null}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>标签</span>
            <input
              type="text"
              placeholder="campaign, launch"
              value={form.tags}
              onChange={(event) =>
                setForm((current) => ({ ...current, tags: event.target.value }))
              }
            />
          </label>
          <label className="field field-span-2">
            <span>标题</span>
            <input
              type="text"
              placeholder="春季发布页"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label className="field field-span-2">
            <span>描述</span>
            <textarea
              rows={3}
              placeholder=""
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>过期时间</span>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
            />
          </label>
          {editing !== null ? (
            <label className="field">
              <span>状态</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as 'active' | 'disabled',
                  }))
                }
              >
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          ) : null}
          <div className="form-span-2 ai-suggest-row">
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={suggesting}
              onClick={() => void suggest()}
            >
              <Sparkles size={15} />
              {suggesting ? '正在生成建议…' : '用 AI 补全元数据'}
            </button>
          </div>
          {formError.length > 0 ? (
            <div className="form-error form-span-2">{formError}</div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
