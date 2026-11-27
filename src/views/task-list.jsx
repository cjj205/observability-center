import React, { useMemo } from 'react';
import { useState } from 'react';
import { AGENT_LABELS, TASK_TYPE_LABELS } from '../lib/constants';
import { fmtAgo, fmtMs, fmtTime } from '../lib/format';
import { StatusPill, SummaryChips } from '../ui/common';
import { IconChevronRight, IconRefresh, IconSearch } from '../ui/icons';
import { toGridTemplate, useResizableColumns } from '../hooks/useResizableColumns';

/** 任务列表的列：表头与数据行共用，顺序即渲染顺序。最后一列为无表头的跳转箭头。 */
const COLUMNS = [
    { key: 'task', label: '协作任务' },
    { key: 'type', label: '类型' },
    { key: 'agents', label: '参与智能体' },
    { key: 'time', label: '开始时间' },
    { key: 'duration', label: '耗时' },
    { key: 'spans', label: 'Span' },
    { key: 'status', label: '状态' },
    { key: 'go', label: '' },
];
const COLUMN_KEYS = COLUMNS.map((column) => column.key);
const COLUMN_STORAGE_KEY = 'openan.observation-center.task-list.columns';

export function TaskListView({ loading, error, dataset, onOpen, onReload }) {
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const { widths, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp, resetColumn, resetAll } =
        useResizableColumns(COLUMN_STORAGE_KEY, COLUMN_KEYS);
    const gridTemplate = useMemo(() => toGridTemplate(COLUMN_KEYS, widths), [widths]);
    const hasCustomWidths = Object.keys(widths).length > 0;
    const tasks = (dataset?.tasks || []).slice();
    const filtered = tasks.filter((t) => {
        if (statusFilter === 'ok' && t.status === 'error') return false;
        if (statusFilter === 'error' && t.status !== 'error') return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return [t.title, t.runId, t.taskId, t.taskType, ...(t.agents || [])]
            .some((v) => String(v).toLowerCase().includes(q));
    });
    return (
        <div className="obs-body">
            {loading && !dataset && (
                <div className="obs-list-empty"><div className="obs-spinner" /><p>正在加载协作任务轨迹…</p></div>
            )}
            {error && !dataset && (
                <div className="obs-list-empty">
                    <p className="obs-error-title">协作任务数据加载失败（{error}）</p>
                    <button type="button" className="obs-btn obs-btn-primary" onClick={onReload}><IconRefresh /><span>重试</span></button>
                </div>
            )}
            {dataset && (
                <>
                    <SummaryChips tasks={tasks} />
                    <div className="obs-list-tools">
                        <label className="obs-search">
                            <IconSearch />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="搜索任务 / runId / 智能体"
                            />
                        </label>
                        <div className="obs-filter">
                            {[['all', `全部 ${tasks.length}`], ['ok', `成功 ${tasks.filter((t) => t.status !== 'error').length}`], ['error', `失败 ${tasks.filter((t) => t.status === 'error').length}`]].map(([k, label]) => (
                                <button
                                    key={k}
                                    type="button"
                                    className={`obs-filter-btn ${statusFilter === k ? 'obs-filter-btn-active' : ''}`}
                                    onClick={() => setStatusFilter(k)}
                                >{label}</button>
                            ))}
                        </div>
                        <span className="obs-list-hint">
                            数据源：{dataset.source || 'simulated'} · {dataset.shape || ''}
                        </span>
                        {hasCustomWidths && (
                            <button
                                type="button"
                                className="obs-btn obs-col-reset"
                                onClick={resetAll}
                                title="清除已保存的列宽，全部列恢复自适应"
                            >
                                重置列宽
                            </button>
                        )}
                    </div>
                    <div className="obs-task-scroll">
                        <div className={`obs-task-list${hasCustomWidths ? ' obs-task-list-resized' : ''}`}>
                            <div className="obs-task-row obs-task-head" style={{ gridTemplateColumns: gridTemplate }}>
                                {COLUMNS.map((column) => (
                                    <span
                                        key={column.key}
                                        className="obs-task-head-cell"
                                        title={column.label ? '拖动右缘调整列宽，双击恢复自适应' : undefined}
                                        onDoubleClick={() => resetColumn(column.key)}
                                    >
                                        <span className="obs-task-head-label">{column.label}</span>
                                        {column.key !== 'go' && (
                                            <span
                                                className="obs-col-resizer"
                                                role="separator"
                                                aria-orientation="vertical"
                                                aria-label={`调整「${column.label}」列宽`}
                                                onPointerDown={(event) => onHandlePointerDown(event, column.key)}
                                                onPointerMove={onHandlePointerMove}
                                                onPointerUp={onHandlePointerUp}
                                                onPointerCancel={onHandlePointerUp}
                                                onDoubleClick={(event) => { event.stopPropagation(); resetColumn(column.key); }}
                                            />
                                        )}
                                    </span>
                                ))}
                            </div>
                            {filtered.map((t) => (
                                <div key={t.taskId} className="obs-task-row" style={{ gridTemplateColumns: gridTemplate }} onClick={() => onOpen(t)} role="button" tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t); }}>
                                    <div className="obs-task-title">
                                        <span className="obs-task-name">{t.title}</span>
                                        <span className="obs-task-run">{t.runId}</span>
                                    </div>
                                    <span className="obs-type-tag">{TASK_TYPE_LABELS[t.taskType] || t.taskType}</span>
                                    <span className="obs-task-agents">{(t.agents || []).map((a) => AGENT_LABELS[a] || a).join(' · ')}</span>
                                    <span className="obs-task-time">{fmtTime(t.startedAt)}<em>{fmtAgo(t.startedAt)}</em></span>
                                    <span className="obs-task-dur">{fmtMs(t.durationMs)}</span>
                                    <span className="obs-task-spans">{t.spanCount}</span>
                                    <StatusPill status={t.status} />
                                    <span className="obs-task-go"><IconChevronRight /></span>
                                </div>
                            ))}
                            {filtered.length === 0 && <div className="obs-list-empty"><p>没有匹配的任务</p></div>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/** 按智能体聚合 Span 统计（Agent 维度）。 */
