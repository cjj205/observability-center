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

    if (!roots.length) return <span className="obs-sig-none">本任务无 Span 数据</span>;
    return <div className="obs-tree">{roots.map((r) => renderRow(r, 0))}</div>;
}

/** 日志列表（按信号类别过滤：message / workflow / agent）。 */
