import { useEffect, useMemo, useState } from 'react'
import type { VaultSettings } from '../../core/types.js'
import type { DetectedPluginView, PluginListResponse } from '../api.js'
import { useT, type MessageKey } from '../i18n.js'
import { Button, Card, CardHead, Checkbox, LoadingInline, Rows, Select, SettingRow, Switch, Tag } from './ui.js'

export interface PluginCopiesApi {
  listPlugins(checkRegistry?: boolean): Promise<PluginListResponse>
  updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings>
}

/**
 * 保存插件副本: which plugins get a copy of their installed package in the snapshot
 * (default: all), and how restore uses those copies. Choices persist in settings.
 */
export function PluginCopiesCard({ api }: { api: PluginCopiesApi }) {
  const tr = useT()
  const [plugins, setPlugins] = useState<DetectedPluginView[] | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [exclude, setExclude] = useState<Set<string>>(new Set())
  const [order, setOrder] = useState<VaultSettings['pluginRestoreOrder']>('source-first')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    // Fast list first, then the registry check (non-blocking, bounded server-side).
    api.listPlugins(false).then((r) => {
      if (!alive) return
      setPlugins(r.plugins)
      setEnabled(r.settings?.enabled !== false)
      setExclude(new Set(r.settings?.exclude ?? []))
      setOrder(r.restoreOrder ?? 'source-first')
      setChecking(true)
      return api.listPlugins(true).then((full) => { if (alive) setPlugins(full.plugins) })
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [api])

  const save = (patch: Partial<VaultSettings>) => {
    api.updateSettings(patch).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const setCopies = (nextEnabled: boolean, nextExclude: Set<string>) => {
    setEnabled(nextEnabled)
    setExclude(nextExclude)
    save({ pluginCopies: { enabled: nextEnabled, exclude: [...nextExclude].sort() } })
  }
  const toggle = (key: string) => {
    const next = new Set(exclude)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCopies(enabled, next)
  }
  const selected = useMemo(() => (plugins ?? []).filter((p) => !exclude.has(p.key)).length, [plugins, exclude])

  return (
    <Card>
      <CardHead
        title={tr('copies.title')}
        sub={tr('copies.desc')}
        actions={enabled && plugins?.length ? (
          <>
            <span className="dv-small dv-muted dv-num">{tr('backup.scopeSummary', { selected, total: plugins.length })}</span>
            <Button size="sm" variant="quiet" onClick={() => setCopies(true, new Set())}>{tr('backup.scopeAll')}</Button>
            <Button size="sm" variant="quiet" onClick={() => setCopies(true, new Set(plugins.map((p) => p.key)))}>{tr('backup.scopeNone')}</Button>
          </>
        ) : null}
      />
      <div className="dv-card-sep" aria-hidden="true" />
      <Rows>
        <SettingRow
          title={tr('copies.enable')}
          description={tr('copies.enableDesc')}
          htmlFor="dv-copies-enable"
          control={<Switch id="dv-copies-enable" checked={enabled} onChange={() => setCopies(!enabled, exclude)} />}
        />
        <SettingRow title={tr('copies.order')} description={tr('copies.orderDesc')} htmlFor="dv-copies-order">
          <Select
            id="dv-copies-order"
            value={order}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value === 'copy-first' ? 'copy-first' : 'source-first'
              setOrder(v)
              save({ pluginRestoreOrder: v })
            }}
          >
            <option value="source-first">{tr('copies.order.source-first')}</option>
            <option value="copy-first">{tr('copies.order.copy-first')}</option>
          </Select>
        </SettingRow>
      </Rows>
      {error ? <p className="dv-hint" style={{ color: 'var(--dv-danger)' }}>{error}</p> : null}
      {enabled ? (
        plugins === null ? (
          <LoadingInline label={tr('copies.loading')} />
        ) : plugins.length === 0 ? (
          <p className="dv-hint">{tr('copies.none')}</p>
        ) : (
          <div className="dv-card-list" style={{ gap: 6 }}>
            {checking ? <span className="dv-small dv-muted">{tr('copies.checking')}</span> : null}
            {plugins.map((p) => (
              <Checkbox
                key={p.key}
                id={`dv-copy-${p.key}`}
                checked={!exclude.has(p.key)}
                onChange={() => toggle(p.key)}
                title={
                  <>
                    <span className="dv-mono">{p.name}</span>
                    {p.version ? <span className="dv-muted dv-num"> @{p.version}</span> : null}
                    {' '}
                    <Tag>{p.profile}</Tag>
                    {' '}
                    <Tag>{tr(`copies.kind.${p.kind}` as MessageKey)}</Tag>
                    {p.recommended ? <>{' '}<Tag tone="warn">{tr('copies.recommended')}</Tag></> : null}
                  </>
                }
                description={
                  p.kind === 'local'
                    ? tr('copies.hint.local')
                    : p.registry === 'missing'
                      ? tr('copies.hint.missing', { version: p.version ?? '' })
                      : p.cordisOnly
                        ? tr('copies.hint.cordisOnly')
                        : undefined
                }
              />
            ))}
          </div>
        )
      ) : null}
    </Card>
  )
}
