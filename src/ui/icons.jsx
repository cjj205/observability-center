import React from 'react';

export function IconRefresh() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
        </svg>
    );
}

export function IconExternal() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
    );
}

/* ==========================================================================
 * Route 1 — /observation 观测中心
 *
 * 页面结构（v1.4.0）：默认展示「协作任务轨迹列表」，点开任务进入详情：
 *   · 左侧：协作拓扑图（协调端 → 参与智能体，按 span 聚合消息流/轮询/流式回传）
 *   · 右侧：三个维度的观测指标
 *       A2A-T 消息  — gen_ai.client.operation.duration / streaming.duration /
 *                     gen_ai.agent.a2at.message 日志
 *       协作工作流  — gen_ai.agent.a2at.task.count / task.duration + Jaeger 轨迹瀑布
 *       Agent      — 按智能体聚合的 Span/消息/耗时/错误与负载占比
 *
 * 数据层：默认读取随插件打包的模拟数据集（consumer-smoke 方式构建、SDK 存储
 * 形态，见 scripts/gen-mock-tasks.mjs）。observability-sdk-java 存储栈
 * （deploy/local-storage：Prometheus+Thanos / OpenSearch / Jaeger）部署并通过
 * nginx 暴露查询 API 后，注入 window.__OPENAN_OBS_DATA_URL__ 即可切换真实端点，
 * 组件按 Jaeger/Prometheus API 形状消费。
 * ======================================================================== */

export function IconSearch() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4-4" />
        </svg>
    );
}

export function IconChevronLeft() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
        </svg>
    );
}

export function IconChevronRight() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

export function IconArrowRight() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    );
}

export function LangfuseMark({ size = 26 }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <defs>
                <linearGradient id="tobs-langfuse-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="55%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
            </defs>
            <path
                stroke="url(#tobs-langfuse-grad)"
                d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            />
        </svg>
    );
}

export function BrandMark({ path, hex, size = 26 }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <path fill={hex} d={path} />
        </svg>
    );
}
