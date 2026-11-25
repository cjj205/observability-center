import React from 'react';
import { AGENT_LABELS } from '../lib/constants';
import { pad2 } from '../lib/format';

export function LogRow({ log, onSelect, selected }) {
    const attrs = log.attributes || {};
    const hasAttrs = Object.keys(attrs).length > 0;
    const rowClick = (e) => {
        e.stopPropagation();
        onSelect?.(log);
    };
    return (
        <div
            className={`obs-logline ${selected ? 'obs-logline-sel' : ''}`}
            onClick={rowClick}
            role="button"
            tabIndex={0}
            title={hasAttrs ? '点击行查看该日志的属性' : undefined}
            onKeyDown={(e) => { if (e.key === 'Enter' && hasAttrs) { e.stopPropagation(); onSelect?.(log); } }}
        >
            <span className={`obs-logline-text ${log.severity === 'ERROR' ? 'obs-log-err' : ''}`}>
                [+{pad2(Math.floor((log.offsetMs || 0) / 60000))}:{pad2(Math.floor(((log.offsetMs || 0) % 60000) / 1000))}] {log.severity} {log.name} — {log.body}（{AGENT_LABELS[log.service] || log.service}）
            </span>
            {hasAttrs && onSelect && (
                <button
                    type="button"
                    className="obs-log-attrbtn"
                    onClick={(e) => { e.stopPropagation(); onSelect(log); }}
                    title="在右侧查看该日志的属性"
                >
                    属性
                </button>
            )}
        </div>
    );
}

/** Trace 视图：按 Span 挂接关系（父子嵌套）展示，每个节点带内联时间条；
 * 节点可展开「关联日志」（log.spanID ↔ span.spanID 的上下文关联）；
 * 「属性」按钮把 Span/日志送入右侧属性查看器（onSelectSpan / onSelectLog）。
 */

export function LogList({ logs, category, onSelect, sel }) {
    const rows = (logs || []).filter((l) => (l.category || 'message') === category);
    return (
        <div className="obs-logs">
            {rows.length ? rows.map((log, i) => (
                <LogRow key={i} log={log} onSelect={onSelect} selected={sel?.kind === 'log' && sel.logRef === log} />
            )) : <span className="obs-sig-none">本任务无该类日志</span>}
        </div>
    );
}

/** Metric 顶层页签内容：按维度子页签展示该维度的指标采样值、采集周期图表与字典。 */
