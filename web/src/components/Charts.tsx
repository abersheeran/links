import { useEffect, useRef, useState } from 'react';
import { formatNumber, formatShortDate, percent } from '../lib/format';

interface TrendPoint {
  timestamp: string;
  clicks: number;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [{ width, height }, setSize] = useState({ width: 820, height: 220 });
  const hasData = data.length > 0;

  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) {
        return;
      }
      const { width: nextWidth, height: nextHeight } = entry.contentRect;
      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, [hasData]);

  const padding = { top: 18, right: 18, bottom: 36, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxClicks = Math.max(1, ...data.map((point) => point.clicks));
  const points = data.map((point, index) => {
    const x =
      data.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (data.length - 1)) * plotWidth;
    const y =
      padding.top + plotHeight - (point.clicks / maxClicks) * plotHeight;
    return { ...point, x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath =
    points.length === 0
      ? ''
      : `${linePath} L ${points.at(-1)?.x ?? padding.left} ${
          padding.top + plotHeight
        } L ${points[0]?.x ?? padding.left} ${padding.top + plotHeight} Z`;
  const activePoint =
    activeIndex === null ? null : (points[activeIndex] ?? null);

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <span>暂无点击</span>
      </div>
    );
  }

  return (
    <div className="trend-chart" ref={chartRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="点击趋势图"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = padding.top + (step / 4) * plotHeight;
          const value = Math.round(maxClicks * (1 - step / 4));
          return (
            <g key={step}>
              <line
                className="chart-grid-line"
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
              />
              <text
                className="chart-axis-label"
                x={padding.left - 10}
                y={y + 4}
              >
                {formatNumber(value)}
              </text>
            </g>
          );
        })}

        <path className="chart-area" d={areaPath} />
        <path className="chart-line" d={linePath} />

        {points.map((point, index) => (
          <g key={`${point.timestamp}-${index}`}>
            <circle
              className="chart-hit"
              cx={point.x}
              cy={point.y}
              r={14}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              tabIndex={0}
            >
              <title>
                {formatShortDate(point.timestamp)} · {point.clicks} 次点击
              </title>
            </circle>
            {activeIndex === index ? (
              <circle
                className="chart-active-point"
                cx={point.x}
                cy={point.y}
                r={5}
              />
            ) : null}
          </g>
        ))}

        <text
          className="chart-axis-label chart-x-label-start"
          x={padding.left}
          y={height - 10}
        >
          {formatShortDate(points[0]?.timestamp ?? data[0]?.timestamp ?? '')}
        </text>
        <text
          className="chart-axis-label chart-x-label-end"
          x={width - padding.right}
          y={height - 10}
        >
          {formatShortDate(points.at(-1)?.timestamp ?? '')}
        </text>
      </svg>
      {activePoint !== null ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(activePoint.y / height) * 100}%`,
          }}
        >
          <strong>{formatNumber(activePoint.clicks)}</strong>
          <span>{formatShortDate(activePoint.timestamp)}</span>
        </div>
      ) : null}
    </div>
  );
}

interface DonutItem {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  items,
  centerLabel,
}: {
  items: DonutItem[];
  centerLabel: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  const segments = items.map((item) => {
    const offset = total === 0 ? 0 : (cursor / total) * circumference;
    cursor += item.value;
    const length = total === 0 ? 0 : (item.value / total) * circumference;
    return { ...item, offset, length };
  });

  return (
    <div className="donut-layout">
      <div className="donut">
        <svg className="donut-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle
            className="donut-track"
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="12"
          />
          {segments.map((segment) => (
            <circle
              key={segment.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={`${segment.length} ${circumference}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 60 60)"
            />
          ))}
        </svg>
        <div className="donut-hole">
          <strong>{formatNumber(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="donut-legend">
        {items.length === 0 ? <span className="muted">暂无数据</span> : null}
        {items.map((item) => (
          <div className="legend-row" key={item.label}>
            <span
              className="legend-swatch"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
            <strong>{percent(item.value, total)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarList({
  items,
  emptyText = '暂无数据',
}: {
  items: Array<{ label: string; value: number; meta?: string }>;
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) {
    return <div className="muted bar-list-empty">{emptyText}</div>;
  }

  return (
    <div className="bar-list">
      {items.map((item, index) => (
        <div className="bar-row" key={`${item.label}-${index}`}>
          <div className="bar-row-head">
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
          </div>
          <div className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
          {item.meta !== undefined ? (
            <span className="bar-meta">{item.meta}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
