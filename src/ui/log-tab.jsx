import React from 'react';
import { useState } from 'react';
import { DIM_NOTES, DIM_TABS, LOG_TITLES } from '../lib/constants';
import { AttrInspector } from '../ui/inspector';
import { LogList } from '../ui/logs';
import { DimensionBlock } from '../views/task-detail';

export function LogTab({ task }) {
    const [sel, setSel] = useState(null);
    const selLog = (l) => setSel({
        kind: 'log',
        title: `日志属性 · ${l.name}`,
        id: l.spanID || l.name,
        attrs: l.attributes || {},
        logRef: l,
    });
    return (
        <div className="obs-split">
            <div className="obs-split-left">
                {DIM_TABS.map((t) => (
                    <DimensionBlock key={t.key} label={t.label} note={DIM_NOTES[t.key]}>
                        <div className="obs-panel">
                            <div className="obs-prom-panel-head">
                                <div className="obs-prom-panel-title">
                                    <span className="obs-prom-expr">{LOG_TITLES[t.key] || t.key}</span>
                                    <span className="obs-prom-panel-sub">索引 a2at-logs-v2 · Data Prepper → OpenSearch</span>
                                </div>
                            </div>
                            <LogList logs={task.logs} category={t.key} onSelect={selLog} sel={sel} />
                        </div>
                    </DimensionBlock>
                ))}
            </div>
            <AttrInspector sel={sel} />
        </div>
    );
}

/* ======================= Metric 页签（Prometheus 式信息架构，系统现有样式） ======================= */

/** Prometheus 式折线：x 轴三刻度 + 当前任务时间带（样式与系统一致）。 */
