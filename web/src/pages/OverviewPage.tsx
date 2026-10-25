import { ArrowUpRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { TrendChart } from '../components/Charts';
import { PageHeader } from '../components/PageHeader';
import { api, errorText } from '../lib/api';
import {
  countryLabel,
  deviceLabel,
  formatDate,
  formatNumber,
  percent,
} from '../lib/format';
import type { AnalyticsData, LinkItem, LinkListResponse } from '../lib/types';

function dateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

export function OverviewPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [totalLinks, setTotalLinks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const range = dateRange(7);
    setLoading(true);
    setError('');
    setAnalyticsError(null);

    Promise.allSettled([
      api<{ data: AnalyticsData }>(
        `/api/v1/analytics?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
      api<LinkListResponse>('/api/v1/links?limit=5'),
    ]).then(([analyticsResult, linksResult]) => {
      if (cancelled) {
        return;
      }
      if (analyticsResult.status === 'fulfilled') {
        setAnalytics(analyticsResult.value.data);
      } else {
        setAnalytics(null);
        setAnalyticsError(
          errorText(analyticsResult.reason, '分析数据暂不可用。'),
        );
      }
      if (linksResult.status === 'fulfilled') {
        setLinks(linksResult.value.data);
        setTotalLinks(linksResult.value.pagination.total);
      } else {
        setError(errorText(linksResult.reason, '链接数据加载失败。'));
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const topDevice = useMemo(() => {
    const item = analytics?.topDevices[0];
    return item === undefined ? '—' : deviceLabel(item.device);
  }, [analytics]);

  const topCountry = useMemo(() => {
    const item = analytics?.topCountries[0];
    return item === undefined ? '—' : countryLabel(item.country);
  }, [analytics]);

  return (
    <div className="page-content overview-page">
      <PageHeader
        title="总览"
        actions={
          can('links:write') ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => navigate('/app/links?new=1')}
            >
              <Plus size={16} />
              新建链接
            </button>
          ) : null
        }
      />

      {error.length > 0 ? <div className="form-error">{error}</div> : null}

      <section className="stats-grid">
        <StatCard
          label="近 7 天点击"
          value={loading ? '—' : formatNumber(analytics?.totals.clicks ?? 0)}
        />
        <StatCard
          label="链接总量"
          value={formatNumber(totalLinks)}
        />
        <StatCard label="主要设备" value={topDevice} />
        <StatCard label="主要来源国" value={topCountry} />
      </section>

      <section className="overview-grid">
        <article className="panel panel-trend">
          <div className="panel-heading">
            <div>
              <h3>点击趋势</h3>
            </div>
            <Link className="text-link" to="/app/analytics">
              深入分析 <ArrowUpRight size={14} />
            </Link>
          </div>
          {analyticsError !== null ? (
            <div className="chart-empty">
              <span>分析数据暂不可用</span>
            </div>
          ) : (
            <TrendChart data={analytics?.series ?? []} />
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>热门链接</h3>
            </div>
            <Link className="text-link" to="/app/links">
              全部链接 <ArrowUpRight size={14} />
            </Link>
          </div>
          {analytics?.topLinks.length === 0 || analytics === null ? (
            <div className="muted empty-inline">暂无数据</div>
          ) : (
            <div className="rank-list">
              {analytics.topLinks.slice(0, 5).map((item, index) => (
                <div className="rank-row" key={item.linkId}>
                  <span className="rank-index">0{index + 1}</span>
                  <div>
                    <strong>/{item.code}</strong>
                    <small>
                      {percent(item.clicks, analytics.totals.clicks)}% 的点击
                    </small>
                  </div>
                  <b>{formatNumber(item.clicks)}</b>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>最近创建</h3>
          </div>
          <Link className="text-link" to="/app/links">
            管理链接 <ArrowUpRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="muted empty-inline">正在读取链接…</div>
        ) : links.length === 0 ? (
          <div className="muted empty-inline">暂无链接</div>
        ) : (
          <div className="compact-table">
            {links.map((link) => (
              <div className="compact-row" key={link.id}>
                <div className="compact-code">
                  <code>/{link.code}</code>
                  <span>{link.title ?? '未命名链接'}</span>
                </div>
                <span className={`status-badge status-${link.status}`}>
                  {link.status === 'active' ? '启用' : '停用'}
                </span>
                <span className="compact-target">{link.targetUrl}</span>
                <span className="compact-date">
                  {formatDate(link.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
