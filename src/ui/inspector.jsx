import React from 'react';
import { IdChip } from '../ui/common';

export function AttrInspector({ sel }) {
    const attrs = sel?.attrs || {};
    const keys = Object.keys(attrs).sort();
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
