import React from 'react';
import { useState } from 'react';
import { AGENT_LABELS } from '../lib/constants';
import { IdChip } from '../ui/common';
import { AttrInspector } from '../ui/inspector';
import { SpanTree } from '../ui/span-tree';

export function TraceContent({ task }) {
    const [sel, setSel] = useState(null);
    const selSpan = (s) => setSel({
        kind: 'span',
        title: `Span 属性 · ${s.operationName}（${AGENT_LABELS[s.service] || s.service}）`,
        id: s.spanID,
        attrs: s.tags || {},
        spanRef: s,
    });
    const selLog = (l) => setSel({
        kind: 'log',
        title: `日志属性 · ${l.name}`,
        id: l.spanID || l.name,
        attrs: l.attributes || {},
        logRef: l,
    });
    return (
        <div className="obs-split">
            <div className="obs-panel obs-split-left">
                <div className="obs-prom-panel-head">
                    <div className="obs-prom-panel-title">
                        <span className="obs-prom-expr">协作任务 Trace · 观测信号挂接关系</span>
                        <span className="obs-prom-panel-sub">按 Span 挂接关系（父子嵌套）展示 · 点「收起日志」折叠 · Jaeger v2 → OpenSearch jaeger-*</span>
                    </div>
                    {task.trace?.traceID && <IdChip id={task.trace.traceID} prefix="TraceID" tone="blue" />}
                </div>
                <SpanTree task={task} onSelectSpan={selSpan} onSelectLog={selLog} sel={sel} />
            </div>
            <AttrInspector sel={sel} />
        </div>
    );
}

/** Log 顶层页签：三个维度区块共享右侧唯一一个属性查看器。 */
