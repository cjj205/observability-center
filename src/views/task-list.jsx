import React from 'react';
import { useState } from 'react';
import { AGENT_LABELS, TASK_TYPE_LABELS } from '../lib/constants';
import { fmtAgo, fmtMs, fmtTime } from '../lib/format';
import { StatusPill, SummaryChips } from '../ui/common';
import { IconChevronRight, IconRefresh, IconSearch } from '../ui/icons';

export function TaskListView({ loading, error, dataset, onOpen, onReload }) {
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
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
                    </div>
                    <div className="obs-task-scroll">
                        <div className="obs-task-list">
                            <div className="obs-task-row obs-task-head">
                                <span>协作任务</span><span>类型</span><span>参与智能体</span><span>开始时间</span><span>耗时</span><span>Span</span><span>状态</span><span />
                            </div>
                            {filtered.map((t) => (
                                <div key={t.taskId} className="obs-task-row" onClick={() => onOpen(t)} role="button" tabIndex={0}
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
