import { CalendarRange, Link2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BarList, DonutChart, TrendChart } from '../components/Charts';
import { PageHeader } from '../components/PageHeader';
import { api, ApiRequestError } from '../lib/api';
import {
  browserLabel,
  countryLabel,
  deviceLabel,
  formatNumber,
  percent,
} from '../lib/format';
import type { AnalyticsData, LinkListResponse } from '../lib/types';

type RangePreset = '7d' | '30d' | '90d';

const ranges: Array<{ key: RangePreset; label: string; days: number }> = [
  { key: '7d', label: '近 7 天', days: 7 },
  { key: '30d', label: '近 30 天', days: 30 },
  { key: '90d', label: '近 90 天', days: 90 },
];

const deviceColors: Record<string, string> = {
  mobile: 'var(--accent)',
  desktop: 'var(--chart-2)',
  tablet: 'var(--chart-3)',
  bot: 'var(--chart-4)',
  unknown: 'var(--chart-5)',
};

function rangeQuery(preset: RangePreset): { from: string; to: string } {
  const days = ranges.find((item) => item.key === preset)?.days ?? 7;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function DataCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="data-card">
      <div className="data-card-head">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [linkId, setLinkId] = useState('');
  const [links, setLinks] = useState<
    Array<{ id: string; code: string; title: string | null }>
  >([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<LinkListResponse>('/api/v1/links?limit=100')
      .then((payload) =>
        setLinks(
          payload.data.map((link) => ({
            id: link.id,
            code: link.code,
            title: link.title,
          })),
        ),
      )
      .catch(() => {
        // The analytics view still works without the filter list.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const range = rangeQuery(preset);
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
    });
    if (linkId.length > 0) {
      params.set('linkId', linkId);
    }

    setLoading(true);
    setError(null);
    api<{ data: AnalyticsData }>(`/api/v1/analytics?${params.toString()}`)
      .then((payload) => {
        if (!cancelled) {
          setAnalytics(payload.data);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setAnalytics(null);
          setError(requestError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [preset, linkId]);

  const devices = useMemo(
    () =>
      (analytics?.topDevices ?? []).map((item) => ({
        label: deviceLabel(item.device),
        value: item.clicks,
        color: deviceColors[item.device] ?? 'var(--chart-5)',
      })),
    [analytics],
  );

  const campaignItems = useMemo(
    () =>
      (analytics?.topCampaigns ?? []).map((item) => ({
        label:
          item.campaign === 'none'
            ? '无活动参数'
            : `${item.campaign} · ${item.source}/${item.medium}`,
        value: item.clicks,
      })),
    [analytics],
  );

  const configError =
    error instanceof ApiRequestError &&
    error.code === 'analytics_not_configured';

  return (
    <div className="page-content analytics-page">
      <PageHeader title="数据分析" />

      <div className="analytics-filterbar">
        <div className="range-tabs" role="tablist" aria-label="分析时间范围">
          {ranges.map((range) => (
            <button
              key={range.key}
              className={`range-tab ${preset === range.key ? 'range-tab-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={preset === range.key}
              onClick={() => setPreset(range.key)}
            >
              {range.label}
            </button>
          ))}
        </div>
        <label className="select-field">
          <Link2 size={15} />
          <select
            value={linkId}
            onChange={(event) => setLinkId(event.target.value)}
            aria-label="筛选短链接"
          >
            <option value="">全部链接</option>
            {links.map((link) => (
              <option value={link.id} key={link.id}>
                /{link.code} {link.title === null ? '' : `· ${link.title}`}
              </option>
            ))}
          </select>
        </label>
        <span className="analytics-range-note">
          <CalendarRange size={14} />
          {analytics === null
            ? '正在读取时间范围'
            : `${new Date(analytics.range.from).toLocaleDateString('zh-CN')} — ${new Date(
                analytics.range.to,
              ).toLocaleDateString('zh-CN')}`}
        </span>
      </div>

      {configError ? (
        <div className="form-error">分析服务未配置。</div>
      ) : error !== null ? (
        <div className="form-error">分析数据加载失败。</div>
      ) : null}

      <section className="data-grid">
        <DataCard
          label="成功点击"
          value={loading ? '—' : formatNumber(analytics?.totals.clicks ?? 0)}
        />
        <DataCard
          label="主要设备"
          value={
            loading
              ? '—'
              : analytics?.topDevices[0] === undefined
                ? '—'
                : deviceLabel(analytics.topDevices[0].device)
          }
        />
        <DataCard
          label="主要来源国"
          value={
            loading
              ? '—'
              : analytics?.topCountries[0] === undefined
                ? '—'
                : countryLabel(analytics.topCountries[0].country)
          }
        />
        <DataCard
          label="热门链接"
          value={
            loading
              ? '—'
              : analytics?.topLinks[0] === undefined
                ? '—'
                : `/${analytics.topLinks[0].code}`
          }
        />
      </section>

      <section className="panel analytics-trend-panel">
        <div className="panel-heading">
          <div>
            <h3>点击脉冲</h3>
          </div>
          <span className="panel-note">
            {analytics?.meta.sampled ? '采样权重已还原' : '原始事件'}
          </span>
        </div>
        {loading ? (
          <div className="chart-empty">正在读取趋势…</div>
        ) : (
          <TrendChart data={analytics?.series ?? []} />
        )}
      </section>

      <section className="analytics-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>设备构成</h3>
            </div>
          </div>
          <DonutChart items={devices} centerLabel="点击" />
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>国家 / 地区</h3>
            </div>
          </div>
          <BarList
            items={(analytics?.topCountries ?? []).map((item) => ({
              label: countryLabel(item.country),
              value: item.clicks,
            }))}
          />
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>来源域名</h3>
            </div>
          </div>
          <BarList
            items={(analytics?.topReferrers ?? []).map((item) => ({
              label: item.referrer === 'direct' ? '直接访问' : item.referrer,
              value: item.clicks,
            }))}
          />
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>UTM 活动</h3>
            </div>
          </div>
          <BarList items={campaignItems} />
        </article>
      </section>

      <section className="analytics-grid analytics-grid-bottom">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h3>浏览器</h3>
            </div>
          </div>
          <BarList
            items={(analytics?.topBrowsers ?? []).map((item) => ({
              label: browserLabel(item.browser),
              value: item.clicks,
            }))}
          />
        </article>
        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <h3>链接排名</h3>
            </div>
          </div>
          {analytics?.topLinks.length === 0 || analytics === null ? (
            <div className="muted empty-inline">暂无数据</div>
          ) : (
            <div className="ranking-table">
              {analytics.topLinks.map((item, index) => (
                <div className="ranking-row" key={item.linkId}>
                  <span className="rank-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <code>/{item.code}</code>
                  <div className="ranking-bar">
                    <span
                      style={{
                        width: `${Math.max(
                          5,
                          percent(item.clicks, analytics.totals.clicks),
                        )}%`,
                      }}
                    />
                  </div>
                  <strong>{formatNumber(item.clicks)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
