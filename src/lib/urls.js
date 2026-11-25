import { DEFAULT_DATA_URL, DEFAULT_LANGFUSE_URL } from '../lib/constants';

export function resolveLangfuseUrl() {
    if (typeof window === 'undefined') return DEFAULT_LANGFUSE_URL;
    const override = window.__OPENAN_OBSERVATION_LANGFUSE_URL__;
    if (typeof override === 'string' && override.trim()) {
        return override.trim().replace(/\/+$/, '');
    }
    return DEFAULT_LANGFUSE_URL;
}

export function resolveDataUrl() {
    if (typeof window === 'undefined') return DEFAULT_DATA_URL;
    const override = window.__OPENAN_OBS_DATA_URL__;
    return typeof override === 'string' && override.trim() ? override.trim() : DEFAULT_DATA_URL;
}
