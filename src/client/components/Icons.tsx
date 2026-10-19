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
export const IconFolder = icon(
  <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2h8.6A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />,
  'IconFolder',
)
export const IconFile = icon(
  <>
    <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4" />
  </>,
  'IconFile',
)
