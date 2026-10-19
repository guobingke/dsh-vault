/**
 * Minimal inline SVG glyphs (stroke based, 24×24, currentColor).
 *
 * Only what the settings section genuinely needs: disclosure chevrons,
 * password reveal, and the destructive-action mark in confirm dialogs.
 * Everything else is plain text — the host uses very few icons and so do we.
 */
import type { SVGProps } from 'react';
export type IconProps = SVGProps<SVGSVGElement> & {
    size?: number;
    strokeWidth?: number;
};
export declare const IconChevronDown: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
export declare const IconChevronRight: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
export declare const IconAlert: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
export declare const IconEye: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
export declare const IconEyeOff: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
export declare const IconFolder: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
export declare const IconFile: {
    ({ size, strokeWidth, ...rest }: IconProps): import("react").JSX.Element;
    displayName: string;
};
//# sourceMappingURL=Icons.d.ts.map