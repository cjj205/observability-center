

export const MENU_LABELS = {
    en: {
        'Observation Center': 'Observation Center',
        'Third-party Observability': 'Third-party Observability',
    },
    zh: {
        'Observation Center': '可观测中心',
        'Third-party Observability': '三方可观测',
    },
};

export function registerMenuLabels() {
    if (typeof window === 'undefined') return;
    let i18n = null;
    try {
        const ctx = window.__OPENAN_PORTAL_CONTEXT__;
        if (ctx && ctx.i18n) i18n = ctx.i18n;
    } catch { /* ignore */ }
    if (!i18n) {
        try {
            const ri = window.ReactI18next;
            if (ri && typeof ri.getI18n === 'function') i18n = ri.getI18n();
        } catch { /* ignore */ }
    }
    if (!i18n || typeof i18n.addResource !== 'function') return;
    for (const [lng, labels] of Object.entries(MENU_LABELS)) {
        for (const [key, value] of Object.entries(labels)) {
            try { i18n.addResource(lng, 'translation', key, value, { deep: true }); } catch { /* ignore */ }
        }
    }
}
registerMenuLabels();

registerMenuLabels();

