import React from 'react';
import { useState } from 'react';
import { AGENT_LABELS, DIM_TABS } from '../lib/constants';
import { METRIC_GROUPS } from '../metric-catalog';
import { agentStats, fmtMs, fmtValue, shortAttrKey } from '../lib/format';
import { PromGraph, PromHistogram, PromLegend } from '../ui/charts';
import { AttrChip } from '../ui/common';
import { SignalValueList } from '../ui/dict';

export function MetricContent({ dim, task, charts }) {
    const band = Number.isNaN(Date.parse(task.startedAt))
        ? null
        : { from: Date.parse(task.startedAt), to: Date.parse(task.startedAt) + task.durationMs };
    if (dim === 'workflow') {
        const m = task.metrics || {};
        const dur = m.taskDuration || {};
        return (
            <>
                <div className="obs-metric-grid">
                    <div className="obs-chip"><span className="obs-chip-value">{m.taskCount ?? '—'}</span><span className="obs-chip-label">任务计数 · task.count</span></div>
                    <div className="obs-chip"><span className="obs-chip-value">{fmtMs(dur.avg)}</span><span className="obs-chip-label">任务时长均值 · task.duration</span></div>
                    <div className="obs-chip"><span className="obs-chip-value">{fmtMs(dur.p95)}</span><span className="obs-chip-label">P95 任务时长</span></div>
                    <div className="obs-chip"><span className="obs-chip-value">{task.spanCount}</span><span className="obs-chip-label">Span 数</span></div>
                </div>
                <div className="obs-attr-row obs-attr-row-note">
                    <span className="obs-attr-row-label">task.duration / task.count 维度属性：</span>
                    <AttrChip k="extension.name" v="task-t" />
                    <AttrChip k="task.type" v={task.taskType} />
                    <AttrChip k="task.object" v={task.runId} />
                </div>
                {m.promql && (
                    <div className="obs-panel">
                        <div className="obs-panel-title"><span>PromQL（真实栈查询）</span></div>
                        <div className="obs-promql">
                            {m.promql.duration}<br />
                            {m.promql.count}
                        </div>
                    </div>
                )}
                <SignalValueList dim="workflow" task={task} charts={charts} band={band} />
            </>
        );
    }
    if (dim === 'agent') {
        const stats = agentStats(task);
        const total = Math.max(task.durationMs, 1);
        return (
            <>
                <div className="obs-metric-grid">
                    <div className="obs-chip"><span className="obs-chip-value">{stats.length}</span><span className="obs-chip-label">参与智能体</span></div>
                    <div className="obs-chip"><span className="obs-chip-value">{stats.filter((e) => e.errors > 0).length}</span><span className="obs-chip-label">异常智能体</span></div>
                    <div className="obs-chip"><span className="obs-chip-value">{stats.reduce((a, e) => a + e.messages, 0)}</span><span className="obs-chip-label">处理消息总数</span></div>
                </div>
                <div className="obs-panel">
                    <div className="obs-panel-title">
                        <span>智能体负载 · 按 Span 耗时占比</span>
                        <span className="obs-panel-note">总观测窗口 {fmtMs(total)}</span>
                    </div>
                    <table className="obs-ops-table">
                        <thead><tr><th>智能体</th><th>Span</th><th>处理消息</th><th>累计耗时</th><th>平均耗时</th><th>负载占比</th><th>异常</th></tr></thead>
                        <tbody>
                            {stats.map((e) => (
                                <tr key={e.service}>
                                    <td>
                                        <div className="obs-agent-cell">
                                            <span>{AGENT_LABELS[e.service] || e.service}</span>
                                            <AttrChip k="gen_ai.agent.name" v={e.service} />
                                        </div>
                                    </td>
                                    <td>{e.spans}</td>
                                    <td>{e.messages}</td>
                                    <td>{fmtMs(e.totalMs)}</td>
                                    <td>{fmtMs(e.avgMs)}</td>
                                    <td>
                                        <div className="obs-load">
                                            <div className="obs-load-bar"><span style={{ width: `${e.share}%` }} /></div>
                                            <span className="obs-load-num">{e.share}%</span>
                                        </div>
                                    </td>
                                    <td>{e.errors > 0 ? <span className="obs-pill obs-pill-err">{e.errors}</span> : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <SignalValueList dim="agent" task={task} charts={charts} band={band} />
            </>
        );
    }
    // A2A-T 消息（默认）
    const spans = task.trace?.spans || [];
    const m = task.metrics || {};
    const handled = spans.filter((s) => s.kind === 'SERVER');
    const sent = spans.filter((s) => s.kind === 'CLIENT' && s.operationName === 'SendMessage');
    const streamEvents = spans.filter((s) => s.operationName === 'SendStreamingMessage-event').length;
    const errCount = spans.filter((s) => s.status === 'error').length;
    const handledAvg = handled.length ? Math.round(handled.reduce((a, s) => a + s.durationMs, 0) / handled.length) : 0;
    return (
        <>
            <div className="obs-metric-grid">
                <div className="obs-chip"><span className="obs-chip-value">{handled.length}</span><span className="obs-chip-label">处理消息 · SendMessage(S)</span></div>
                <div className="obs-chip"><span className="obs-chip-value">{sent.length}</span><span className="obs-chip-label">发起消息 · SendMessage(C)</span></div>
                <div className="obs-chip"><span className="obs-chip-value">{fmtMs(handledAvg)}</span><span className="obs-chip-label">平均消息处理耗时</span></div>
                <div className="obs-chip"><span className="obs-chip-value">{streamEvents}</span><span className="obs-chip-label">流式事件 · streaming</span></div>
                <div className="obs-chip"><span className="obs-chip-value">{errCount}</span><span className="obs-chip-label">异常 span · error.type</span></div>
            </div>
            <div className="obs-panel">
                <div className="obs-panel-title">
                    <span>A2A 协议操作指标 · gen_ai.client.operation.duration</span>
                    <span className="obs-panel-note">单位 s</span>
                </div>
                <table className="obs-ops-table">
                    <thead><tr><th>操作</th><th>维度属性</th><th>次数</th><th>平均耗时</th></tr></thead>
                    <tbody>
                        {(m.operations || []).map((op) => (
                            <tr key={op.operation}>
                                <td>{op.operation}</td>
                                <td>
                                    <div className="obs-attr-row">
                                        <AttrChip k="operation.name" v={op.operation} />
                                        <AttrChip k="gen_ai.system" v="A2A" />
                                    </div>
                                </td>
                                <td>{op.count}</td>
                                <td>{op.avgDurationS} s</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <SignalValueList dim="message" task={task} charts={charts} band={band} />
        </>
    );
}

export function MetricPromTab({ task, dataset }) {
    const charts = dataset?.charts;
    const collection = dataset?.collection;
    const allMetrics = METRIC_GROUPS.flatMap((g) => g.metrics);
    const [expr, setExpr] = useState('gen_ai.agent.a2at.task.duration');
    const [view, setView] = useState('graph'); // graph | table
    const [dimFilter, setDimFilter] = useState('all');
    const metric = allMetrics.find((m) => m.name === expr) || allMetrics[0];
    const line = charts?.lines?.[metric?.name];
    const hist = charts?.histograms?.[metric?.name];
    const band = Number.isNaN(Date.parse(task.startedAt))
        ? null
        : { from: Date.parse(task.startedAt), to: Date.parse(task.startedAt) + task.durationMs };
    const sampled = (task.signals || []).filter((s) => s.metric === metric?.name).flatMap((s) => s.samples || []);
    const dimName = { message: 'A2A-T 消息', workflow: '协作工作流', agent: 'Agent' };
    const filtered = allMetrics.filter((m) => dimFilter === 'all' || m.dim === dimFilter);
    const allTaskSamples = (dataset?.tasks || []).flatMap((tk) => (tk.signals || [])
        .filter((s) => s.metric === metric?.name)
        .flatMap((s) => s.samples.map((sm) => ({ runId: tk.runId, value: sm.value, attributes: sm.attributes }))));
    const rangeLabel = collection ? (collection.windowMin >= 60 ? `${collection.windowMin / 60}h` : `${collection.windowMin}m`) : '2h';

    return (
        <>
            <div className="obs-panel obs-prom-toolbar">
                <div className="obs-prom-toolbar-row">
                    <span className="obs-attr-row-label">观测信号选择：</span>
                    <select
                        className="obs-prom-input"
                        value={expr}
                        onChange={(e) => setExpr(e.target.value)}
                        aria-label="观测信号选择"
                        title="选择观测信号，图表即时刷新"
                    >
                        {DIM_TABS.map((t) => (
                            <optgroup key={t.key} label={t.label}>
                                {allMetrics.filter((m) => m.dim === t.key).map((m) => (
                                    <option key={m.name} value={m.name}>{m.name}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <div className="obs-prom-meta">
                        <AttrChip k="采集周期" v={`${collection?.intervalSec}s`} />
                        <AttrChip k="范围" v={rangeLabel} />
                        <span className="obs-panel-note">{collection?.storage || 'Prometheus / Thanos'}</span>
                    </div>
                </div>
            </div>

            <div className="obs-panel">
                <div className="obs-prom-panel-head">
                    <div className="obs-prom-panel-title">
                        <span className="obs-prom-expr">{expr}</span>
                        <span className="obs-prom-panel-sub">
                            {metric?.type === 'histogram' ? '直方图' : '计数器'} · 单位 {metric?.unit || '—'} · {line?.label}
                        </span>
                    </div>
                    <div className="obs-filter">
                        {[['graph', '图表'], ['table', '表格']].map(([v, label]) => (
                            <button
                                key={v}
                                type="button"
                                className={`obs-filter-btn ${view === v ? 'obs-filter-btn-active' : ''}`}
                                onClick={() => setView(v)}
                            >{label}</button>
                        ))}
                    </div>
                </div>
                {metric?.desc && <div className="obs-prom-desc">含义：{metric.desc}</div>}
                {view === 'graph' && line && (
                    <>
                        <div className="obs-prom-charts-grid">
                            <div className="obs-chart-cell">
                                <div className="obs-chart-cell-title">折线图 · {line.label}</div>
                                <PromGraph line={line} band={band} />
                            </div>
                            {hist && (
                                <div className="obs-chart-cell">
                                    <div className="obs-chart-cell-title">直方图 · {hist.label}</div>
                                    <PromHistogram hist={hist} />
                                </div>
                            )}
                        </div>
                        <PromLegend line={line} />
                    </>
                )}
                {view === 'table' && (
                    <table className="obs-ops-table obs-prom-table">
                        <thead><tr><th>任务</th><th>维度属性</th><th>值</th></tr></thead>
                        <tbody>
                            {allTaskSamples.map((r, i) => (
                                <tr key={i}>
                                    <td className="obs-prom-mono">{r.runId}</td>
                                    <td>
                                        <div className="obs-attr-row">
                                            {Object.entries(r.attributes || {}).map(([k, v]) => (
                                                <AttrChip key={k} k={shortAttrKey(k)} v={v} />
                                            ))}
                                        </div>
                                    </td>
                                    <td><span className="obs-sig-val">{fmtValue(metric?.unit, r.value)}</span></td>
                                </tr>
                            ))}
                            {!allTaskSamples.length && (
                                <tr><td colSpan="3" className="obs-sig-none">—（本任务未触发该信号）</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="obs-panel">
                <div className="obs-prom-panel-head">
                    <div className="obs-prom-panel-title">
                        <span className="obs-prom-expr">查询结果 · {allMetrics.length} 个信号</span>
                        <span className="obs-prom-panel-sub">点击行切换上方图表；按维度过滤</span>
                    </div>
                    <div className="obs-filter">
                        {[['all', '全部'], ...DIM_TABS.map((t) => [t.key, t.label])].map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                className={`obs-filter-btn ${dimFilter === k ? 'obs-filter-btn-active' : ''}`}
                                onClick={() => setDimFilter(k)}
                            >{label}</button>
                        ))}
                    </div>
                </div>
                <table className="obs-ops-table obs-prom-table">
                    <thead><tr><th>维度</th><th>指标</th><th>类型</th><th>单位</th><th>当前值（本任务）</th></tr></thead>
                    <tbody>
                        {filtered.map((m) => {
                            const vals = (task.signals || []).filter((s) => s.metric === m.name).flatMap((s) => s.samples || []);
                            const isSel = m.name === metric?.name;
                            return (
                                <tr
                                    key={m.name}
                                    className={`obs-prom-row ${isSel ? 'obs-prom-row-sel' : ''}`}
                                    onClick={() => setExpr(m.name)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter') setExpr(m.name); }}
                                >
                                    <td>{dimName[m.dim] || m.dim}</td>
                                    <td className="obs-prom-mono obs-prom-mname">{m.name}</td>
                                    <td>{m.type === 'histogram' ? '直方图' : '计数器'}</td>
                                    <td>{m.unit || '—'}</td>
                                    <td>
                                        {vals.length
                                            ? vals.map((s, i) => <span key={i} className="obs-sig-val" style={{ marginRight: 10 }}>{fmtValue(m.unit, s.value)}</span>)
                                            : <span className="obs-sig-none">未触发</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/** 维度区块头（同一页签内纵向排布的维度分区）。 */
