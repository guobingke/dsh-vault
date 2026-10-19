import { type ReactNode } from 'react';
import type { DiffItem } from '../../core/types.js';
/** Rows per group before 「显示更多」. */
export declare const GROUP_PAGE = 50;
export interface DiffGroup {
    id: string;
    items: DiffItem[];
    counts: Record<DiffItem['change'], number>;
}
/** Group preview items by category (plugins, profiles, MCP, …), hide 相同 unless asked, filter by path. */
export declare function groupDiffItems(items: DiffItem[], opts: {
    showUnchanged: boolean;
    query: string;
}): DiffGroup[];
export declare function DiffGroups({ items, renderOutcome, }: {
    items: DiffItem[];
    /** Right-hand cell for a row (strategy · will apply / skip). */
    renderOutcome: (item: DiffItem) => ReactNode;
}): import("react").JSX.Element;
//# sourceMappingURL=DiffGroups.d.ts.map