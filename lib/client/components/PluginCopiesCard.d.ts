import type { VaultSettings } from '../../core/types.js';
import type { PluginListResponse } from '../api.js';
export interface PluginCopiesApi {
    listPlugins(checkRegistry?: boolean): Promise<PluginListResponse>;
    updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings>;
}
/**
 * 保存插件副本: which plugins get a copy of their installed package in the snapshot
 * (default: all), and how restore uses those copies. Choices persist in settings.
 */
export declare function PluginCopiesCard({ api }: {
    api: PluginCopiesApi;
}): import("react").JSX.Element;
//# sourceMappingURL=PluginCopiesCard.d.ts.map