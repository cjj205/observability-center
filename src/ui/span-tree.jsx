import React from 'react';
import { useState } from 'react';
import { AGENT_LABELS } from '../lib/constants';
import { fmtMs } from '../lib/format';
import { buildSpanTree } from '../lib/span';
import { IdChip, KindBadge } from '../ui/common';
import { LogRow } from '../ui/logs';

export function SpanTree({ task, onSelectSpan, onSelectLog, sel }) {
    const logs = task.logs || [];
    const spans = task.trace?.spans || [];
    const total = Math.max(task.durationMs, 1);
    const logsBySpan = new Map();
    for (const l of logs) {
        if (!l.spanID) continue;
        if (!logsBySpan.has(l.spanID)) logsBySpan.set(l.spanID, []);
        logsBySpan.get(l.spanID).push(l);
    }
    const [openSpans, setOpenSpans] = useState({});
    const { roots, children } = buildSpanTree(spans);

    // 统计条：Span 总数 / 错误 Span / 协作智能体 + 一键收起/展开全部挂接日志
    const logSpans = spans.filter((s) => (logsBySpan.get(s.spanID) || []).length > 0);
    const allOpen = logSpans.length > 0 && logSpans.every((s) => openSpans[s.spanID] ?? true);
    const errCount = spans.filter((s) => s.status === 'error').length;
    const svcCount = new Set(spans.map((s) => s.service)).size;
    const toggleAll = () => {
        setOpenSpans(allOpen ? Object.fromEntries(logSpans.map((s) => [s.spanID, false])) : {});
    };
    const statsBar = (
        <div className="obs-chips obs-trace-stats">
            <div className="obs-chip">
                <span className="obs-chip-value">{spans.length}</span>
                <span className="obs-chip-label">Span 总数</span>
            </div>
            <div className="obs-chip">
                <span className="obs-chip-value" style={errCount > 0 ? { color: '#dc2626' } : undefined}>{errCount}</span>
                <span className="obs-chip-label">错误 Span</span>
            </div>
            <div className="obs-chip">
                <span className="obs-chip-value">{svcCount}</span>
                <span className="obs-chip-label">协作智能体</span>
            </div>
            {logs.length > 0 && (
                <button
                    type="button"
                    className="obs-btn obs-trace-logtoggle"
                    onClick={toggleAll}
                    title={allOpen ? '一键收起所有 Span 挂接的日志' : '一键展开所有 Span 挂接的日志'}
                >
                    {allOpen ? '全部收起日志' : '全部展开日志'}
                </button>
            )}
        </div>
    );

    const renderRow = (s, depth) => {
        const kids = children.get(s.spanID) || [];
        const logsFor = logsBySpan.get(s.spanID) || [];
        const tagKeys = Object.keys(s.tags || {});
        // 关联日志默认展开（未手动切换过时 open=true）
        const open = openSpans[s.spanID] ?? true;
        // 选中态：当前查看的 Span 行高亮
        const isSel = sel?.kind === 'span' && sel.spanRef === s;
        return (
            <div key={s.spanID}>
                <div
                    className={`obs-tree-row ${s.status === 'error' ? 'obs-tree-row-err' : ''} ${isSel ? 'obs-tree-row-sel' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onSelectSpan?.(s); }}
                    role="button"
                    tabIndex={0}
                    title="点击行在右侧查看该 Span 的属性"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onSelectSpan?.(s); } }}
                >
                <div className="obs-tree-row-inner">
                    <div className="obs-tree-main" style={{ marginLeft: depth * 16 }}>
                        <KindBadge kind={s.kind} />
                        <span className="obs-tree-op">{s.operationName}</span>
                        <span className="obs-wf-service">{AGENT_LABELS[s.service] || s.service}</span>
                        {s.status === 'error' && s.tags?.['error.type'] && (
                            <span className="obs-pill obs-pill-err">{s.tags['error.type']}</span>
                        )}
                    </div>
                    <IdChip id={s.spanID} prefix="spanID" tone="indigo" />
                    <div className="obs-tree-bar-wrap">
                        <span className="obs-tree-bar-track">
                            <span
                                className={`obs-wf-bar obs-wf-bar-${(s.kind || 'INTERNAL').toLowerCase()} ${s.status === 'error' ? 'obs-wf-bar-err' : ''}`}
                                style={{ left: `${(s.startOffsetMs / total) * 100}%`, width: `${Math.max((s.durationMs / total) * 100, 1.5)}%` }}
                            />
                        </span>
                    </div>
                    <span className="obs-wf-dur">{fmtMs(s.durationMs)}</span>
                    <div className="obs-tree-logcol">
                        {tagKeys.length > 0 && onSelectSpan && (
                            <button
                                type="button"
                                className="obs-btn obs-tree-logbtn"
                                onClick={(e) => { e.stopPropagation(); onSelectSpan(s); }}
                                title="在右侧属性查看器中显示该 Span 的属性"
                            >
                                属性 {tagKeys.length}
                            </button>
                        )}
                        {logsFor.length > 0 && (
                            <button
                                type="button"
                                className={`obs-btn obs-tree-logbtn ${open ? 'obs-tree-logbtn-open' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setOpenSpans((v) => ({ ...v, [s.spanID]: !open })); }}
                                title={open ? '收起该 Span 挂接的日志' : '展开该 Span 挂接的日志'}
                            >
                                {open ? '收起日志' : '关联日志'} {logsFor.length}
                            </button>
                        )}
                    </div>
                </div>
                </div>
                {open && logsFor.length > 0 && (
                    <div className="obs-tree-logs" style={{ marginLeft: depth * 16 + 20 }}>
                        {logsFor.map((l, i) => (
                            <LogRow key={i} log={l} onSelect={onSelectLog} selected={sel?.kind === 'log' && sel.logRef === l} />
                        ))}
                    </div>
                )}
                {kids.length > 0 && (
                    <div className="obs-tree-children">
                        {kids.map((k) => renderRow(k, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (!roots.length) {
        return (
            <>
                {statsBar}
                <span className="obs-sig-none">本任务无 Span 数据</span>
            </>
        );
    }
    return (
        <>
            {statsBar}
            <div className="obs-tree">{roots.map((r) => renderRow(r, 0))}</div>
        </>
    );
}

/** 日志列表（按信号类别过滤：message / workflow / agent）。 */
