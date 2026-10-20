// Mounts the real VaultApp (same component tree dsh renders) for tests/browser-e2e-ui.test.ts.
import { createRoot } from 'react-dom/client'
import { VaultApp, type VaultTab } from '../../src/client/VaultApp.js'

const tab = (new URLSearchParams(location.search).get('tab') ?? 'overview') as VaultTab
createRoot(document.getElementById('root')!).render(<VaultApp hostLocale="zh-CN" initialTab={tab} />)
