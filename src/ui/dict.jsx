import React from 'react';
import { DIM_NOTES, DIM_TABS } from '../lib/constants';
import { METRIC_GROUPS } from '../metric-catalog';
import { fmtValue, shortAttrKey } from '../lib/format';
import { AttrChip } from '../ui/common';
import { DimensionBlock } from '../views/task-detail';

export function SignalValueCard({ metric, task, charts, band }) {
    const sampled = (task.signals || [])
        .filter((s) => s.metric === metric.name)
        .flatMap((s) => s.samples || []);
    const line = charts?.lines?.[metric.name];
    const hist = charts?.histograms?.[metric.name];
    return (
        <div className="obs-sigcard">
            <div className="obs-sigcard-head">
                <span className="obs-dict-name">{metric.name}</span>
                <span className="obs-panel-note">
                    {metric.type === 'histogram' ? '直方图' : '计数器'} · 单位 {metric.unit || '—'} · 定义见「数据信号字典」
                </span>
            </div>
            <div className="obs-sigcard-value">
                <span className="obs-attr-row-label">当前值（本任务采样）：</span>
                {sampled.length ? sampled.map((s, i) => (
                    <span key={i} className="obs-sig">
                        <span className="obs-sig-val">{fmtValue(metric.unit, s.value)}</span>
                        <span className="obs-sig-attrs">
                            {Object.entries(s.attributes || {}).map(([k, v]) => (
                                <AttrChip key={k} k={shortAttrKey(k)} v={v} />
                            ))}
                        </span>
                    </span>
                )) : (
                    <span className="obs-sig-none">—（本任务未触发该信号）</span>
                )}
            </div>
            {line && (
                <LineChart
                    title={line.label}
                    unit={line.unit}
                    intervalSec={charts?.intervalSec}
                    series={line.series}
                    band={band}
                />
            )}
            {hist && (
                <HistogramChart
                    title={hist.label}
                    unit={hist.unit}
                    buckets={hist.buckets}
                    sampleCount={hist?.buckets?.reduce((a, b) => a + b.count, 0)}
                />
            )}
        </div>
    );
}

/** Metric 页签内的信号值列表（按维度）。 */

export function SignalValueList({ dim, task, charts, band }) {
    const metrics = METRIC_GROUPS.flatMap((g) => g.metrics).filter((m) => m.dim === dim);
    return (
        <>
            {metrics.map((m) => (
                <SignalValueCard key={m.name} metric={m} task={task} charts={charts} band={band} />
            ))}
        </>
    );
}

/** 数据信号字典顶层页签：全部 15 个信号的定义与属性明细（按维度分组）。 */

export function DictContent() {
    const groups = METRIC_GROUPS;
    const total = groups.reduce((a, g) => a + g.metrics.length, 0);
    return (
        <>
            <div className="obs-attr-row obs-attr-row-note">
                <span className="obs-attr-row-label">
                    数据信号字典：全部 {total} 个观测信号的定义与属性明细（来源 observability-sdk-java
                    信号目录 a2at.yaml / agent.yaml / workflow.yaml）；采样值与图表见「Metric」页签。
                </span>
            </div>
            {DIM_TABS.map((t) => {
                const dimMetrics = groups.flatMap((g) => g.metrics).filter((m) => m.dim === t.key);
                return (
                    <DimensionBlock key={t.key} label={t.label} note={DIM_NOTES[t.key]}>
                        <div className="obs-panel">
                            <div className="obs-panel-title">
                                <span>数据信号字典 · {t.label}维度（{dimMetrics.length} 个信号）</span>
                                <span className="obs-panel-note">属性明细：属性名 / OTel 全名 / 类型 / 是否必填 / 取值</span>
                            </div>
                            {groups.map((g) => {
                                const gm = g.metrics.filter((m) => m.dim === t.key);
                                if (!gm.length) return null;
                                return (
                                    <div key={g.group} className="obs-dict-group">
                                        <div className="obs-dict-group-title">
                                            {g.group} <span className="obs-panel-note">定义于 {g.source}</span>
                                        </div>
                                        <table className="obs-ops-table obs-dict-table">
                                            <thead>
                                                <tr><th>指标 / Prometheus 序列</th><th>类型 · 单位</th><th>属性信息</th></tr>
                                            </thead>
                                            <tbody>
                                                {gm.map((m) => (
                                                    <tr key={m.name}>
                                                        <td>
                                                            <div className="obs-dict-name">{m.name}</div>
                                                            <div className="obs-dict-prom">
                                                                {m.prom}{m.type === 'histogram' ? '（_bucket / _sum / _count）' : ''}
                                                            </div>
                                                            {m.desc && <div className="obs-dict-desc">含义：{m.desc}</div>}
                                                        </td>
                                                        <td>
                                                            <span className="obs-type-tag">{m.type === 'histogram' ? '直方图' : '计数器'}</span>
                                                            <span className="obs-dict-unit">{m.unit || '—'}</span>
                                                        </td>
                                                        <td>
                                                            <div className="obs-attrs">
                                                                {m.attributes.map((a) => (
                                                                    <div key={a.key} className="obs-attr">
                                                                        <div className="obs-attr-key">
                                                                            <span className="obs-attr-key-name">{a.key}</span>
                                                                            {a.required ? <span className="obs-attr-req">必填</span> : <span className="obs-attr-opt">可选</span>}
                                                                        </div>
                                                                        <div className="obs-attr-otel">
                                                                            {a.otel} · {a.type}{a.values ? ` · 取值：${a.values.join(' / ')}` : ''}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    </DimensionBlock>
                );
            })}
        </>
    );
}
