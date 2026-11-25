import React from 'react';
import { fmtChartNum } from '../lib/format';

export function PromGraph({ line, band }) {
    const series = line.series;
    const all = series.flatMap((s) => s.points);
    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    const vMax = Math.max(...all.map((p) => p.v), 1) * 1.15;
    const w = 440;
    const h = 120;
    const padL = 46;
    const padR = 10;
    const padT = 12;
    const padB = 20;
    const X = (t) => padL + ((t - t0) / (t1 - t0 || 1)) * (w - padL - padR);
    const Y = (v) => padT + (1 - v / vMax) * (h - padT - padB);
    const bandRect = band ? { x1: X(Math.max(band.from, t0)), x2: X(Math.min(band.to, t1)) } : null;
    const fmtT = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
    return (
        <>
            <svg viewBox={`0 0 ${w} ${h}`} className="obs-chart-svg obs-prom-chartsvg" role="img" aria-label={line.label}>
                {bandRect && bandRect.x2 > bandRect.x1 && (
                    <rect x={bandRect.x1} y={padT} width={Math.max(bandRect.x2 - bandRect.x1, 2)} height={h - padT - padB} fill="rgba(37, 99, 235, 0.08)" />
                )}
                {[0.25, 0.5, 0.75, 1].map((f, i) => {
                    const v = vMax * f;
                    return (
                        <g key={i}>
                            <line x1={padL} y1={Y(v)} x2={w - padR} y2={Y(v)} stroke="rgba(127, 127, 127, 0.18)" strokeWidth="1" />
                            <text x={padL - 6} y={Y(v) + 3} textAnchor="end" className="obs-chart-ylabel">{fmtChartNum(v, line.unit)}</text>
                        </g>
                    );
                })}
                <line x1={padL} y1={Y(0)} x2={w - padR} y2={Y(0)} stroke="rgba(127, 127, 127, 0.4)" strokeWidth="1" />
                {series.map((s) => (
                    <g key={s.prom || s.name}>
                        <path
                            d={s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}
                            fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round"
                        />
                    </g>
                ))}
                <text x={padL} y={h - 8} className="obs-chart-xlabel">{fmtT(t0)}</text>
                <text x={w / 2} y={h - 8} textAnchor="middle" className="obs-chart-xlabel">{fmtT((t0 + t1) / 2)}</text>
                <text x={w - padR} y={h - 8} textAnchor="end" className="obs-chart-xlabel">{fmtT(t1)}</text>
            </svg>
        </>
    );
}

/** legend 表：series（Prom 序列名）+ avg/max/last 统计。 */

export function PromLegend({ line }) {
    return (
        <table className="obs-ops-table obs-prom-legend">
            <thead><tr><th /> <th>series</th><th>avg</th><th>max</th><th>last</th></tr></thead>
            <tbody>
                {line.series.map((s) => {
                    const vs = s.points.map((p) => p.v);
                    const st = { avg: vs.reduce((a, b) => a + b, 0) / vs.length, max: Math.max(...vs), last: vs[vs.length - 1] };
                    return (
                        <tr key={s.prom || s.name}>
                            <td><i className="obs-prom-swatch" style={{ background: s.color }} /></td>
                            <td className="obs-prom-mono">{s.prom || s.name}</td>
                            <td>{fmtChartNum(st.avg, line.unit)}</td>
                            <td>{fmtChartNum(st.max, line.unit)}</td>
                            <td>{fmtChartNum(st.last, line.unit)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/** 直方图（le 桶柱状，系统蓝；绘图区与折线图同边界，X 轴对齐）。 */

export function PromHistogram({ hist }) {
    const buckets = hist.buckets;
    const max = Math.max(...buckets.map((b) => b.count), 1);
    const w = 440;
    const h = 120;
    const padL = 46;
    const padR = 10;
    const padT = 14;
    const padB = 20;
    const n = buckets.length;
    const slot = (w - padL - padR) / n;
    const barW = Math.min(slot * 0.62, 44);
    const prevLe = buckets.length >= 2 ? buckets[n - 2].le : null;
    return (
        <div className="obs-prom-histwrap">
            <svg viewBox={`0 0 ${w} ${h}`} className="obs-chart-svg obs-prom-chartsvg" role="img" aria-label={hist.label}>
                {buckets.map((b, i) => {
                    const bh = (b.count / max) * (h - padT - padB);
                    const x = padL + slot * i + (slot - barW) / 2;
                    const y = h - padB - bh;
                    return (
                        <g key={i}>
                            {bh > 0 && <rect x={x} y={y} width={barW} height={bh} rx="3" fill="#2563eb" opacity="0.85" />}
                            <text x={x + barW / 2} y={y - 5} textAnchor="middle" className="obs-chart-barlabel">{b.count}</text>
                            <text x={x + barW / 2} y={h - 8} textAnchor="middle" className="obs-chart-xlabel">
                                {b.inf ? `>${prevLe != null ? fmtChartNum(prevLe, hist.unit) : '∞'}` : `≤${fmtChartNum(b.le, hist.unit)}`}
                            </text>
                        </g>
                    );
                })}
                <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(127, 127, 127, 0.4)" strokeWidth="1" />
            </svg>
        </div>
    );
}

/** Metric 顶层页签：Prometheus 式信息架构 —— 观测信号选择 + Graph/Table 面板 + 指标浏览表。 */
