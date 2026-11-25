import React from 'react';
import './index.css';
import { useState } from 'react';
import { useCollabTasks } from './hooks/useCollabTasks';
import { IconRefresh } from './ui/icons';
import { TaskDetailView } from './views/task-detail';
import { TaskListView } from './views/task-list';
import { ThirdPartyObservability } from './ui/third-party';

export default function ObservationCenterPlugin() {
    const tasks = useCollabTasks();
    const [selected, setSelected] = useState(null);
    return (
        <div className="obs-plugin-root">
            <div className="obs-toolbar">
                <div className="obs-toolbar-left">
                    <div className="obs-heading">
                        <span className="obs-title">观测中心</span>
                        <span className="obs-subtitle">Collaboration Task Traces · Observation Center</span>
                    </div>
                </div>
                <div className="obs-toolbar-actions">
                    <span className="obs-source-badge" title="默认为 consumer-smoke 方式构建的模拟数据（SDK 存储形态）；存储栈上线后自动切换真实 API">
                        模拟数据 · SDK 存储形态
                    </span>
                    <button type="button" className="obs-btn" onClick={tasks.reload} title="重新拉取协作任务数据">
                        <IconRefresh />
                        <span>刷新数据</span>
                    </button>
                </div>
            </div>

            {selected ? (
                <TaskDetailView task={selected} dataset={tasks.dataset} onBack={() => setSelected(null)} />
            ) : (
                <TaskListView
                    loading={tasks.loading}
                    error={tasks.error}
                    dataset={tasks.dataset}
                    onOpen={setSelected}
                    onReload={tasks.reload}
                />
            )}
        </div>
    );
}

/* ==========================================================================
 * Route 2 — /observation/third-party 三方可观测
 *
 * 三张组件大卡片（开源组件名称）。菜单点击为门户内正常跳转；**点击卡片在
 * 新标签页打开对应组件页面**：
 *   · Langfuse     — 已接入：新页面打开门户自部署 Langfuse 站点（9012）。
 *   · Grafana      — 待接入：先前往 grafana.com 官网；部署完成后把 target
 *                    换成控制台地址即可。
 *   · Prometheus   — 待接入：先前往 prometheus.io 官网；同上。
 * ======================================================================== */

/** Langfuse 卡片图标：火焰轮廓（Lucide "flame" 路径，ISC License），渐变描边。 */

export { ThirdPartyObservability };
