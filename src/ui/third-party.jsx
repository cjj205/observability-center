import React from 'react';
import { THIRD_PARTY_CARDS } from '../lib/constants';
import { resolveLangfuseUrl } from '../lib/urls';
import { BrandMark, IconExternal } from '../ui/icons';
import { GRAFANA_ICON_PATH, PROMETHEUS_ICON_PATH } from '../brand-icons';

export function ThirdPartyObservability() {
    const langfuseUrl = resolveLangfuseUrl();

    // 点击卡片 → 新标签页打开对应组件页面：
    // Langfuse 打开门户自部署站点；Grafana / Prometheus 待接入，先前往官网。
    const openCard = (card) => {
        const target = card.key === 'langfuse' ? langfuseUrl : card.site;
        if (typeof window !== 'undefined' && target) {
            window.open(target, '_blank', 'noopener');
        }
    };

    return (
        <div className="obs-plugin-root">
            <div className="obs-toolbar">
                <div className="obs-toolbar-left">
                    <div className="obs-heading">
                        <span className="obs-title">三方可观测</span>
                        <span className="obs-subtitle">Third-party Observability · 开源组件接入</span>
                    </div>
                </div>
                <div className="obs-toolbar-actions">
                    <span className="tobs-hint">点击卡片在新页面打开对应组件；组件部署完成后在此挂接控制台入口</span>
                </div>
            </div>
            <div className="tobs-body">
                <p className="tobs-intro">
                    三方可观测能力基于业界主流开源组件构建：可观测 = <b>Langfuse</b>（LLM 追踪与评测）、
                    <b>Grafana</b>（可视化看板）与 <b>Prometheus</b>（普罗米修斯，指标采集与告警）。
                </p>
                <div className="tobs-grid">
                    {THIRD_PARTY_CARDS.map((card) => {
                        const ready = card.status === 'ready';
                        const Icon = card.key === 'langfuse'
                            ? card.icon
                            : <BrandMark path={card.key === 'grafana' ? GRAFANA_ICON_PATH : PROMETHEUS_ICON_PATH} hex={card.accent} />;
                        return (
                            <div
                                key={card.key}
                                className={`tobs-card ${ready ? 'tobs-card-ready' : 'tobs-card-pending'}`}
                                style={{ '--tobs-accent': card.accent }}
                                onClick={() => openCard(card)}
                                role="button"
                                tabIndex={0}
                                title={card.openHint}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(card); } }}
                            >
                                <div className="tobs-card-top">
                                    <span className="tobs-icon" style={{ color: card.accent }}>{Icon}</span>
                                    <div className="tobs-name-wrap">
                                        <span className="tobs-name">{card.name}</span>
                                        <span className="tobs-latin">{card.latin}</span>
                                    </div>
                                    <span className={`tobs-pill tobs-pill-${card.status}`}>{card.statusLabel}</span>
                                </div>
                                <p className="tobs-desc">{card.desc}</p>
                                <div className="tobs-card-actions">
                                    {ready ? (
                                        <button
                                            type="button"
                                            className="obs-btn obs-btn-primary"
                                            onClick={(e) => { e.stopPropagation(); openCard(card); }}
                                            title={card.openHint}
                                        >
                                            <IconExternal />
                                            <span>打开 Langfuse</span>
                                        </button>
                                    ) : (
                                        <span className="tobs-pending-note">组件待接入 · 点击卡片先前往官网；部署完成后在此挂接控制台</span>
                                    )}
                                </div>
                                <div className="tobs-card-foot">
                                    <span>{card.linked}</span>
                                    <a href={card.site} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="tobs-site-link">
                                        了解组件 ↗
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
