import type { PluginInstallResultRow } from '../core/types.js';
import type { Translate } from './i18n.js';
export declare function localizeNotice(text: string, t: Translate): string;
/** One short localized line for a plugin row. */
export declare function pluginReasonText(row: PluginInstallResultRow, t: Translate): string;
/** `name（profile）`, each once — a plugin shows twice only when it is in two profiles. */
export declare function failedPluginLabels(rows: PluginInstallResultRow[] | undefined, fallback: string[]): string;
/** Raw text for 详情: the install log for failures, the technical detail for successes. */
export declare function pluginRawDetail(row: PluginInstallResultRow, t: Translate): string | undefined;
/** Server errors are English; show the known ones in the UI language (the raw text stays in the message). */
export declare function localizeError(err: unknown, t: Translate): string;
//# sourceMappingURL=notices.d.ts.map