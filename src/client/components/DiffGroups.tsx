import { useMemo, useState, type ReactNode } from 'react'
import type { BackupCategory, DiffItem } from '../../core/types.js'
import { useT, type MessageKey } from '../i18n.js'
import { Button, SearchInput, Switch } from './ui.js'

const ORDER: BackupCategory[] = [
  'plugins', 'profiles', 'mcp', 'skills', 'settings', 'providers', 'agent-presets',
  'instructions', 'plugin-config', 'plugin-data', 'credentials',
]
const CHANGES: Array<DiffItem['change']> = ['add', 'change', 'remove', 'unchanged']
/** Rows per group before 「显示更多」. */
export const GROUP_PAGE = 50

export interface DiffGroup {
  id: string
  items: DiffItem[]
  counts: Record<DiffItem['change'], number>
}

/** Group preview items by category (plugins, profiles, MCP, …), hide 相同 unless asked, filter by path. */
export function groupDiffItems(items: DiffItem[], opts: { showUnchanged: boolean; query: string }): DiffGroup[] {
  const q = opts.query.trim().toLowerCase()
  const by = new Map<string, DiffGroup>()
  for (const i of items) {
    if (q && !i.path.toLowerCase().includes(q)) continue
    const id = ORDER.includes(i.category) ? i.category : 'other'
    let g = by.get(id)
    if (!g) {
      g = { id, items: [], counts: { add: 0, change: 0, remove: 0, unchanged: 0 } }
      by.set(id, g)
    }
    g.counts[i.change]++
    if (i.change === 'unchanged' && !opts.showUnchanged) continue
    g.items.push(i)
  }
  const rank = { add: 0, change: 1, remove: 2, unchanged: 3 } as const
  const out = [...by.values()]
  for (const g of out) g.items.sort((a, b) => rank[a.change] - rank[b.change] || a.path.localeCompare(b.path))
  return out
    .filter((g) => g.items.length > 0 || opts.showUnchanged)
    .sort((a, b) => (ORDER.indexOf(a.id as BackupCategory) + 1 || 99) - (ORDER.indexOf(b.id as BackupCategory) + 1 || 99))
}

export function DiffGroups({
  items,
  renderOutcome,
}: {
  items: DiffItem[]
  /** Right-hand cell for a row (strategy · will apply / skip). */
  renderOutcome: (item: DiffItem) => ReactNode
}) {
  const tr = useT()
  const [query, setQuery] = useState('')
  const [showUnchanged, setShowUnchanged] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState<Record<string, number>>({})
  const groups = useMemo(() => groupDiffItems(items, { showUnchanged, query }), [items, showUnchanged, query])
  const hiddenUnchanged = showUnchanged ? 0 : items.filter((i) => i.change === 'unchanged').length
  const searching = query.trim().length > 0

  const label = (id: string) => (id === 'other' ? tr('restore.group.other') : tr(`backup.cat.${id}` as MessageKey))
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const countsText = (g: DiffGroup) => CHANGES
    .filter((c) => g.counts[c] > 0)
    .map((c) => `${tr(`restore.filter.${c}` as MessageKey)} ${g.counts[c]}`)
    .join(' · ')

  return (
    <div className="dv-diff-groups">
      <div className="dv-diff-toolbar">
        <div style={{ flex: '1 1 180px', maxWidth: 260 }}>
          <SearchInput value={query} onChange={setQuery} placeholder={tr('restore.diffSearch')} label={tr('restore.diffSearch')} />
        </div>
        <label className="dv-small dv-muted dv-diff-toggle" htmlFor="dv-diff-unchanged">
          <Switch id="dv-diff-unchanged" checked={showUnchanged} onChange={() => setShowUnchanged(!showUnchanged)} />
          {tr('restore.showUnchanged')}
        </label>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="quiet" onClick={() => setOpen(new Set(groups.map((g) => g.id)))}>{tr('restore.expandAll')}</Button>
        <Button size="sm" variant="quiet" onClick={() => setOpen(new Set())}>{tr('restore.collapseAll')}</Button>
      </div>
      {groups.length === 0 ? (
        <span className="dv-hint">{searching ? tr('restore.diffNoMatch') : tr('restore.diffOnlyUnchanged', { count: hiddenUnchanged })}</span>
      ) : null}
      <ul className="dv-diff-list">
        {groups.map((g) => {
          const isOpen = open.has(g.id) || searching
          const max = limit[g.id] ?? GROUP_PAGE
          return (
            <li key={g.id} className="dv-diff-group">
              <button type="button" className="dv-diff-head" aria-expanded={isOpen} onClick={() => toggle(g.id)}>
                <span className="dv-diff-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                <span className="dv-diff-title">{label(g.id)}</span>
                <span className="dv-small dv-muted dv-num">{countsText(g)}</span>
              </button>
              {isOpen ? (
                <div className="dv-diff-body">
                  {g.items.length === 0 ? <span className="dv-hint">{tr('restore.diffGroupAllSame')}</span> : null}
                  {g.items.slice(0, max).map((i) => (
                    <div key={`${i.change}:${i.path}`} className="dv-diff-row" data-change={i.change}>
                      <span className="dv-diff-badge">{tr(`restore.filter.${i.change}` as MessageKey)}</span>
                      <span className="dv-path dv-mono">{i.path}</span>
                      <span className="dv-small">{renderOutcome(i)}</span>
                    </div>
                  ))}
                  {g.items.length > max ? (
                    <Button size="sm" variant="quiet" onClick={() => setLimit((p) => ({ ...p, [g.id]: max + GROUP_PAGE * 4 }))}>
                      {tr('restore.showMore', { count: g.items.length - max })}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {hiddenUnchanged > 0 ? <span className="dv-hint">{tr('restore.unchangedHidden', { count: hiddenUnchanged })}</span> : null}
    </div>
  )
}
