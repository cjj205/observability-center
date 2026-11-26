import React from 'react';
import { useState } from 'react';
import { SPAN_KIND_LABELS } from '../lib/constants';
import { fmtMs } from '../lib/format';

export function StatusPill({ status }) {
    const ok = status !== 'error';
    return (
        <span className={`obs-pill ${ok ? 'obs-pill-ok' : 'obs-pill-err'}`}>
            {ok ? '成功' : '失败'}
        </span>
    );
}

export function KindBadge({ kind }) {
    // 类名统一小写（obs-kind-client 等），与 index.css 配色规则一一对应；
    // PRODUCER/CONSUMER 字母无专属映射时回退首字母。
    return <span className={`obs-kind obs-kind-${(kind || 'INTERNAL').toLowerCase()}`}>{SPAN_KIND_LABELS[kind] || (kind || '?').charAt(0)}</span>;
}

export function SummaryChips({ tasks }) {
    const total = tasks.length;
    const ok = tasks.filter((t) => t.status !== 'error').length;
    const avg = total ? Math.round(tasks.reduce((a, t) => a + t.durationMs, 0) / total) : 0;
    const agents = new Set(tasks.flatMap((t) => t.agents || []));
    return (
        <div className="obs-chips">
            <div className="obs-chip"><span className="obs-chip-value">{total}</span><span className="obs-chip-label">协作任务</span></div>
            <div className="obs-chip"><span className="obs-chip-value">{total ? Math.round((ok / total) * 100) : 0}%</span><span className="obs-chip-label">成功率</span></div>
            <div className="obs-chip"><span className="obs-chip-value">{fmtMs(avg)}</span><span className="obs-chip-label">平均任务耗时</span></div>
            <div className="obs-chip"><span className="obs-chip-value">{agents.size}</span><span className="obs-chip-label">参与智能体</span></div>
        </div>
    );
}

/** 属性键值芯片（详情页指标的真实维度值）。 */

export function AttrChip({ k, v }) {
    return (
        <span className="obs-attr-chip" title={`${k} = ${v}`}>
            <span className="obs-attr-chip-k">{k}</span>
            <span className="obs-attr-chip-eq">=</span>
            <span className="obs-attr-chip-v">{String(v)}</span>
        </span>
    );
}

/** 信号卡片：一个观测信号的当前采样值 + 专属折线图/直方图（定义见「数据信号字典」页签）。 */

export function IdChip({ id, prefix, tone = 'blue' }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        try { navigator.clipboard?.writeText(id); } catch { /* ignore */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };
    return (
        <span
            className={`obs-idchip obs-idchip-${tone} ${copied ? 'obs-idchip-copied' : ''}`}
            onClick={copy}
            title={`点击复制 ${prefix || 'ID'}：${id}`}
            role="button"
        >
            {prefix ? <span className="obs-idchip-prefix">{prefix}</span> : null}
            <span className="obs-idchip-text">{id}</span>
            {copied && <span className="obs-idchip-copied">已复制</span>}
        </span>
    );
}

/** 单条日志行：点击整行或「属性」按钮，在右侧属性查看器查看该日志属性；
 * selected=true 时行保持选中高亮。
 */
