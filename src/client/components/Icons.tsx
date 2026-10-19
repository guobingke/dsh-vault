/**
 * Minimal inline SVG glyphs (stroke based, 24×24, currentColor).
 *
 * Only what the settings section genuinely needs: disclosure chevrons,
 * password reveal, and the destructive-action mark in confirm dialogs.
 * Everything else is plain text — the host uses very few icons and so do we.
 */
import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }

function icon(paths: React.ReactNode, displayName: string) {
  function Icon({ size, strokeWidth = 1.8, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size ?? '1em'}
        height={size ?? '1em'}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    )
  }
  Icon.displayName = displayName
  return Icon
}

export const IconChevronDown = icon(<path d="m6 9 6 6 6-6" />, 'IconChevronDown')
export const IconChevronRight = icon(<path d="m9 6 6 6-6 6" />, 'IconChevronRight')
export const IconAlert = icon(
  <>
    <path d="M12 4v10" />
    <circle cx="12" cy="19" r="0.6" fill="currentColor" />
  </>,
  'IconAlert',
)
export const IconEye = icon(
  <>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  'IconEye',
)
export const IconEyeOff = icon(
  <>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.5" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
  'IconEyeOff',
)
