import React from 'react';
import { IdChip, KindBadge, StatusPill } from '../ui/common';
import { SPAN_KIND_NAMES } from '../lib/constants';
import { fmtMs, fmtTime } from '../lib/format';

export function AttrInspector({ sel }) {
    const attrs = sel?.attrs || {};
    const keys = Object.keys(attrs).sort();
    const spanRef = sel?.kind === 'span' ? sel.spanRef : null;
    const kindName = spanRef ? (SPAN_KIND_NAMES[spanRef.kind] || spanRef.kind || 'Internal') : null;
    const startAbs = spanRef && sel.traceStartISO
        ? new Date(Date.parse(sel.traceStartISO) + (spanRef.startOffsetMs || 0))
        : null;
    return (
        <div className="obs-panel obs-attrinspector">
            <div className="obs-prom-panel-head">
                <div className="obs-prom-panel-title">
                    <span className="obs-prom-expr">{sel?.title || '属性查看器'}</span>
                    <span className="obs-prom-panel-sub">
                        {sel ? '属性明细（属性名 / 值）' : '点击左侧 Span 行或日志行的「属性」在此查看属性明细'}
                    </span>
                </div>
                {sel?.id && <IdChip id={sel.id} prefix={sel.kind === 'span' ? 'spanID' : 'log'} tone={sel.kind === 'span' ? 'indigo' : 'blue'} />}
            </div>
            {spanRef && (
                <div className="obs-spanmeta">
                    <div className="obs-spanmeta-item">
                        <span className="obs-spanmeta-k">本span用时</span>
                        <span className="obs-spanmeta-v">{fmtMs(spanRef.durationMs)}</span>
                    </div>
                    <div className="obs-spanmeta-item">
                        <span className="obs-spanmeta-k">总用时占比</span>
                        <span className="obs-spanmeta-v">
                            {spanRef.durationMs == null ? '—' : `${Math.round((spanRef.durationMs / (sel.totalMs || 1)) * 100)}%`}
                        </span>
                    </div>
                    <div className="obs-spanmeta-item">
                        <span className="obs-spanmeta-k">执行时刻</span>
                        <span className="obs-spanmeta-v">
                            {startAbs ? `${fmtTime(startAbs)}（+${spanRef.startOffsetMs || 0} ms）` : `+${spanRef.startOffsetMs || 0} ms`}
                        </span>
                    </div>
                    <div className="obs-spanmeta-item">
                        <span className="obs-spanmeta-k">类型</span>
                        <span className="obs-spanmeta-v"><KindBadge kind={spanRef.kind} />{kindName}</span>
                    </div>
                    <div className="obs-spanmeta-item">
                        <span className="obs-spanmeta-k">状态</span>
                        <span className="obs-spanmeta-v"><StatusPill status={spanRef.status} /></span>
                    </div>
                </div>
            )}
            {sel && keys.length > 0 && (
                <table className="obs-ops-table obs-span-attrtable">
                    <thead><tr><th>属性</th><th>值</th></tr></thead>
                    <tbody>
                        {keys.map((k) => (
                            <tr key={k}>
                                <td className="obs-prom-mono">{k}</td>
                                <td>{String(attrs[k])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {sel && keys.length === 0 && <span className="obs-sig-none">该记录无属性</span>}
            {!sel && <span className="obs-sig-none">未选择属性对象</span>}
        </div>
    );
}

/** Trace 顶层页签内容：Span 挂接树（父子嵌套 + 关联日志）。 */
