/**
 * In-app file / folder browser for "Browse…" buttons.
 *
 * dsh's native OS chooser only exists on some hosts (loopback web / Desktop on
 * Windows and macOS) and only picks folders, so Browse always opens this
 * dialog, backed by the vault's /fs/list + /fs/mkdir endpoints. When the host
 * exposes the native chooser, a "System dialog…" action is offered too.
 */
import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n.js'
import { IconFile, IconFolder } from './Icons.js'
import { Banner, Button, Checkbox, Dialog, LoadingInline, Select, TextInput } from './ui.js'

export interface FsListingView {
  path: string
  parent: string | null
  home?: string
  roots?: string[]
  sep?: string
  nativePicker?: boolean
  entries: Array<{ name: string; path: string; kind: 'file' | 'directory'; bytes?: number; hidden?: boolean }>
}

/** Filesystem access the picker needs (VaultApi in the app, fakes in tests). */
export interface FsBrowser {
  list: (path: string) => Promise<FsListingView>
  mkdir: (path: string, name: string) => Promise<{ path: string }>
  pickNative?: () => Promise<{ path: string | null }>
}

export type PathPickerMode = 'directory' | 'open' | 'save'

export interface PathPickerProps {
  open: boolean
  mode: PathPickerMode
  fs: FsBrowser
  /** Current text-field value; the browser starts there (or its parent). */
  initialPath?: string
  /** Save mode: suggested file name. */
  defaultFileName?: string
  onSelect: (path: string) => void
  onClose: () => void
}

const ARCHIVE_RE = /\.(tar\.gz|tgz|dshvault)$/i

export function isArchiveName(name: string): boolean {
  return ARCHIVE_RE.test(name)
}

/** Join a directory and a single name with the host separator. */
export function joinPath(dir: string, name: string, sep = '/'): string {
  if (!dir) return name
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}${sep}${name}`
}

/** Parent of a path (either separator); null at a root. */
export function parentOf(p: string): string | null {
  const trimmed = p.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (idx < 0) return null
  if (idx === 0) return trimmed.slice(0, 1)
  const head = trimmed.slice(0, idx)
  return /^[A-Za-z]:$/.test(head) ? `${head}\\` : head
}

function baseName(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}

function formatBytes(n?: number): string {
  if (n === undefined) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function PathPicker({ open, mode, fs, initialPath, defaultFileName, onSelect, onClose }: PathPickerProps) {
  const tr = useT()
  const [listing, setListing] = useState<FsListingView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathInput, setPathInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [fileName, setFileName] = useState('')
  const [nativeBusy, setNativeBusy] = useState(false)

  const load = useCallback(async (path: string, fallbacks: string[] = []) => {
    setLoading(true)
    setError(null)
    const tries = [path, ...fallbacks]
    let lastErr: unknown = null
    for (const p of tries) {
      try {
        const next = await fs.list(p)
        setListing(next)
        setPathInput(next.path)
        setSelectedFile(null)
        setLoading(false)
        return
      } catch (err) {
        lastErr = err
      }
    }
    setLoading(false)
    setError(lastErr instanceof Error ? lastErr.message : String(lastErr))
  }, [fs])

  useEffect(() => {
    if (!open) return
    setCreating(false)
    setNewName('')
    setError(null)
    const start = (initialPath ?? '').trim()
    const isFileLike = mode !== 'directory' && (isArchiveName(start) || /\.[A-Za-z0-9]{1,8}$/.test(baseName(start)))
    if (mode === 'save') setFileName(isFileLike ? baseName(start) : (defaultFileName ?? ''))
    const parent = start ? parentOf(start) : null
    const first = isFileLike ? (parent ?? '') : start
    const fallbacks = [parent, ''].filter((x): x is string => x !== null && x !== first)
    void load(first, fallbacks)
  }, [open, mode, initialPath, defaultFileName, load])

  if (!open) return null

  const sep = listing?.sep ?? '/'
  const entries = (listing?.entries ?? []).filter((e) => showHidden || !e.hidden)
  const visible = mode === 'open' ? entries.filter((e) => e.kind === 'directory' || isArchiveName(e.name)) : entries

  const title = mode === 'directory' ? tr('picker.title.directory') : mode === 'open' ? tr('picker.title.open') : tr('picker.title.save')

  async function createFolder() {
    if (!listing || !newName.trim()) return
    try {
      const r = await fs.mkdir(listing.path, newName.trim())
      setCreating(false)
      setNewName('')
      await load(r.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function useNative() {
    if (!fs.pickNative) return
    setNativeBusy(true)
    setError(null)
    try {
      const r = await fs.pickNative()
      if (r.path) onSelect(r.path)
    } catch (err) {
      setError(tr('picker.nativeFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setNativeBusy(false)
    }
  }

  const cwd = listing?.path ?? ''
  const savePath = mode === 'save' && cwd && fileName.trim() ? joinPath(cwd, fileName.trim(), sep) : null

  const actions = (
    <>
      {mode === 'directory' && listing?.nativePicker && fs.pickNative ? (
        <Button variant="quiet" onClick={() => { void useNative() }} loading={nativeBusy} style={{ marginRight: 'auto' }}>
          {tr('picker.native')}
        </Button>
      ) : null}
      <Button onClick={onClose}>{tr('app.cancel')}</Button>
      {mode === 'directory' ? (
        <Button variant="primary" disabled={!cwd || loading} onClick={() => onSelect(cwd)}>{tr('picker.selectFolder')}</Button>
      ) : null}
      {mode === 'open' ? (
        <>
          <Button disabled={!cwd || loading} onClick={() => onSelect(cwd)}>{tr('picker.selectFolder')}</Button>
          <Button variant="primary" disabled={!selectedFile} onClick={() => { if (selectedFile) onSelect(selectedFile) }}>{tr('picker.selectFile')}</Button>
        </>
      ) : null}
      {mode === 'save' ? (
        <Button variant="primary" disabled={!savePath} onClick={() => { if (savePath) onSelect(savePath) }}>{tr('picker.saveHere')}</Button>
      ) : null}
    </>
  )

  return (
    <Dialog open={open} onClose={onClose} title={title} size="wide" actions={actions}>
      <div className="dv-picker-bar">
        {listing?.roots && listing.roots.length > 0 ? (
          <Select
            aria-label={tr('picker.roots')}
            value={listing.roots.find((r) => cwd.toLowerCase().startsWith(r.toLowerCase())) ?? ''}
            onChange={(e) => { if (e.target.value) void load(e.target.value) }}
          >
            {listing.roots.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        ) : null}
        <Button size="sm" variant="quiet" onClick={() => void load(listing?.home ?? '')} disabled={loading}>{tr('picker.home')}</Button>
        <Button size="sm" variant="quiet" onClick={() => { if (listing?.parent) void load(listing.parent) }} disabled={loading || !listing?.parent}>{tr('picker.up')}</Button>
        <Button size="sm" variant="quiet" onClick={() => setCreating((v) => !v)} disabled={!listing}>{tr('picker.newFolder')}</Button>
      </div>
      <form
        className="dv-picker-bar"
        onSubmit={(e) => { e.preventDefault(); void load(pathInput) }}
      >
        <TextInput aria-label={tr('picker.path')} value={pathInput} onChange={(e) => setPathInput(e.target.value)} mono />
        <Button size="sm" type="submit" disabled={loading}>{tr('picker.go')}</Button>
      </form>
      {creating ? (
        <form className="dv-picker-bar" onSubmit={(e) => { e.preventDefault(); void createFolder() }}>
          <TextInput aria-label={tr('picker.newFolderName')} placeholder={tr('picker.newFolderName')} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Button size="sm" type="submit" variant="primary" disabled={!newName.trim()}>{tr('picker.create')}</Button>
          <Button size="sm" variant="quiet" onClick={() => { setCreating(false); setNewName('') }}>{tr('app.cancel')}</Button>
        </form>
      ) : null}
      {error ? <Banner tone="error" role="alert">{error}</Banner> : null}
      <div className="dv-picker-list" role="listbox" aria-label={title} aria-busy={loading || undefined}>
        {loading && !listing ? <div className="dv-picker-empty"><LoadingInline label={tr('picker.loading')} /></div> : null}
        {listing && visible.length === 0 && !loading ? <div className="dv-picker-empty">{tr('picker.empty')}</div> : null}
        {visible.map((e) => {
          const isDir = e.kind === 'directory'
          const disabled = !isDir && mode === 'directory'
          const selected = !isDir && (selectedFile === e.path || (mode === 'save' && fileName === e.name))
          return (
            <button
              key={e.path}
              type="button"
              role="option"
              aria-selected={selected}
              className="dv-picker-item"
              data-selected={selected ? 'true' : undefined}
              data-hidden={e.hidden ? 'true' : undefined}
              disabled={disabled}
              onClick={() => {
                if (isDir) { void load(e.path); return }
                if (mode === 'open') setSelectedFile(e.path)
                if (mode === 'save') setFileName(e.name)
              }}
              onDoubleClick={() => { if (!isDir && mode === 'open') onSelect(e.path) }}
            >
              <span className="dv-picker-icon">{isDir ? <IconFolder /> : <IconFile />}</span>
              <span className="dv-picker-name">{e.name}</span>
              {!isDir ? <span className="dv-picker-size dv-num">{formatBytes(e.bytes)}</span> : null}
            </button>
          )
        })}
      </div>
      <div className="dv-picker-foot">
        <Checkbox title={tr('picker.showHidden')} checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        {mode === 'open' ? <span className="dv-small dv-muted">{tr('picker.archiveOnly')}</span> : null}
      </div>
      {mode === 'save' ? (
        <TextInput aria-label={tr('picker.fileName')} placeholder={tr('picker.fileName')} value={fileName} onChange={(e) => setFileName(e.target.value)} mono />
      ) : null}
      {mode === 'save' && savePath ? <span className="dv-small dv-muted dv-mono" style={{ overflowWrap: 'anywhere' }}>{savePath}</span> : null}
    </Dialog>
  )
}
