/**
 * Minimal inline SVG icon set (stroke based, 24×24, currentColor).
 * No icon dependency: icons inherit size (1em) and color via CSS.
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

export const IconShield = icon(<path d="M12 3 4.5 6v5.2c0 4.6 3.2 8.4 7.5 9.8 4.3-1.4 7.5-5.2 7.5-9.8V6L12 3Z" />, 'IconShield')
export const IconGauge = icon(
  <>
    <path d="M4 19h16" />
    <path d="M4 19V5" />
    <path d="m7 14 3.5-4 3 2.5L20 6" />
  </>,
  'IconGauge',
)
export const IconArchive = icon(
  <>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </>,
  'IconArchive',
)
export const IconRestore = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </>,
  'IconRestore',
)
export const IconDatabase = icon(
  <>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </>,
  'IconDatabase',
)
export const IconLayers = icon(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </>,
  'IconLayers',
)
export const IconSliders = icon(
  <>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </>,
  'IconSliders',
)
export const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>,
  'IconSettings',
)
export const IconCheck = icon(<path d="m5 12.5 4.5 4.5L19 7" />, 'IconCheck')
export const IconX = icon(<path d="M6 6l12 12M18 6 6 18" />, 'IconX')
export const IconAlert = icon(
  <>
    <path d="M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
  'IconAlert',
)
export const IconInfo = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>,
  'IconInfo',
)
export const IconHelp = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17h.01" />
  </>,
  'IconHelp',
)
export const IconRefresh = icon(
  <>
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M21 4v4h-4M3 20v-4h4" />
  </>,
  'IconRefresh',
)
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />, 'IconPlus')
export const IconTrash = icon(
  <>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4h6v3" />
  </>,
  'IconTrash',
)
export const IconPencil = icon(
  <>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </>,
  'IconPencil',
)
export const IconPlay = icon(<path d="M7 4.5v15l12-7.5-12-7.5Z" />, 'IconPlay')
export const IconClock = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </>,
  'IconClock',
)
export const IconCalendar = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
  'IconCalendar',
)
export const IconLock = icon(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </>,
  'IconLock',
)
export const IconUnlock = icon(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 7.5-2" />
  </>,
  'IconUnlock',
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
export const IconKey = icon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.7-8.7M16 7l3 3M18.5 4.5l2.5 2.5" />
  </>,
  'IconKey',
)
export const IconCloud = icon(
  <path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19h11Z" />,
  'IconCloud',
)
export const IconFolder = icon(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  'IconFolder',
)
export const IconGithub = icon(
  <path d="M15 22v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.8a5.3 5.3 0 0 0-1.4-3.7 4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.5 0C6.2 1.1 5.1 1.4 5.1 1.4a4.9 4.9 0 0 0-.1 3.6A5.3 5.3 0 0 0 3.6 8.7c0 5.3 3.2 6.5 6.2 6.8a3.4 3.4 0 0 0-.9 2.6V22M9 19.5c-3 .9-3-1.5-4.5-2" />,
  'IconGithub',
)
export const IconServer = icon(
  <>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01M11 7.5h4M11 16.5h4" />
  </>,
  'IconServer',
)
export const IconHardDrive = icon(
  <>
    <path d="M21 12H3l2.4-6.5A2 2 0 0 1 7.3 4h9.4a2 2 0 0 1 1.9 1.5L21 12v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
    <path d="M7 15h.01M11 15h2" />
  </>,
  'IconHardDrive',
)
export const IconDownload = icon(
  <>
    <path d="M12 4v11M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </>,
  'IconDownload',
)
export const IconUpload = icon(
  <>
    <path d="M12 16V5M7 10l5-5 5 5" />
    <path d="M4 19h16" />
  </>,
  'IconUpload',
)
export const IconChevronDown = icon(<path d="m6 9 6 6 6-6" />, 'IconChevronDown')
export const IconChevronRight = icon(<path d="m9 6 6 6-6 6" />, 'IconChevronRight')
export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  'IconSearch',
)
export const IconCopy = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </>,
  'IconCopy',
)
export const IconZap = icon(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />, 'IconZap')
export const IconGlobe = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
  'IconGlobe',
)
export const IconMoon = icon(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />, 'IconMoon')
export const IconSun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
  'IconSun',
)
export const IconMonitor = icon(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </>,
  'IconMonitor',
)
export const IconSparkles = icon(
  <>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
  </>,
  'IconSparkles',
)
export const IconInbox = icon(
  <>
    <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    <path d="M5.5 5h13l2.5 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4l2.5-8Z" />
  </>,
  'IconInbox',
)
export const IconWifiOff = icon(
  <>
    <path d="M2 2l20 20" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M14 9.9a10 10 0 0 1 5 3M2 8.8a15 15 0 0 1 4.2-2.7M10 4.2a15 15 0 0 1 12 4.6" />
    <path d="M12 20h.01" />
  </>,
  'IconWifiOff',
)
export const IconFilePlus = icon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M12 12v6M9 15h6" />
  </>,
  'IconFilePlus',
)
export const IconFileEdit = icon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 17l1-3 4-4 2 2-4 4-3 1Z" />
  </>,
  'IconFileEdit',
)
export const IconFileMinus = icon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 15h6" />
  </>,
  'IconFileMinus',
)
export const IconCheckCircle = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.7 2.7L16.5 9" />
  </>,
  'IconCheckCircle',
)
export const IconShieldCheck = icon(
  <>
    <path d="M12 3 4.5 6v5.2c0 4.6 3.2 8.4 7.5 9.8 4.3-1.4 7.5-5.2 7.5-9.8V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
  'IconShieldCheck',
)
export const IconTerminal = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7 9 3 3-3 3M13 15h4" />
  </>,
  'IconTerminal',
)
export const IconSave = icon(
  <>
    <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M8 3v5h7M8 21v-7h8v7" />
  </>,
  'IconSave',
)
export const IconLanguages = icon(
  <>
    <path d="M3 5h8M7 3v2c0 4-1.8 7-4 9M5 9c1 2.2 2.8 4 5 5" />
    <path d="m12 20 4-10 4 10M13.5 17h5" />
  </>,
  'IconLanguages',
)

/** Map a storage kind to its icon component. */
export function storageIcon(kind: string) {
  switch (kind) {
    case 'github':
      return IconGithub
    case 'webdav':
      return IconCloud
    case 's3':
      return IconServer
    default:
      return IconHardDrive
  }
}
