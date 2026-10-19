# dsh-vault UI — design system & component map

This document describes the redesigned Settings UI. It stays inside the
boundary of [`FRONTEND_CONTRACT.md`](./FRONTEND_CONTRACT.md): no backend, API,
storage or encryption code changed, and no panel props were removed.

---

## 1. Principles

1. **Calm, high-contrast, dark-first.** Deep neutral surfaces, one blue-violet
   accent, status colour used only where it carries meaning. A light theme with
   the same hierarchy is available and follows the dsh theme by default.
2. **One job per screen.** Six tabs mirror the backup lifecycle:
   Overview → Backup → Restore → Storage → Snapshots → Settings.
3. **Every state is designed.** Loading, empty, error, in-progress and success
   are explicit UI states — never a blank panel.
4. **Safety is visible.** Restore is a four-step flow with a diff, per-path
   conflict choices and a confirmation dialog. Destructive actions
   (delete target / snapshot, restore) always confirm in a dialog.
5. **Secrets never echo.** Passwords, tokens and secret keys are masked
   (`type="password"` with a show/hide toggle) and are never rendered back from
   saved configuration; edit forms keep the stored value when a secret field is
   left empty.
6. **Accessible by default.** Semantic landmarks, labelled form fields, real
   radio/checkbox inputs for keyboard users, a focus trap and Escape handling
   in dialogs, `aria-live` status regions, and focus-visible rings everywhere.

---

## 2. Tokens (`src/client/theme.css`)

All styling goes through `--dv-*` custom properties defined on
`.dsh-vault-root`. Components never hard-code colours.

### Layers

| Layer | Examples | Notes |
|---|---|---|
| Palette | `--dv-brand-400…700`, `--dv-accent-alt`, `--dv-ok-h`, `--dv-warn-h`, `--dv-danger-h`, `--dv-info-h` | Accent + status hues. Status colours are generated with `hsl()` so light/dark can shift lightness only. |
| Semantic | `--dv-bg`, `--dv-surface`, `--dv-surface-raised`, `--dv-surface-2`, `--dv-surface-hover`, `--dv-border`, `--dv-border-strong`, `--dv-text`, `--dv-text-muted`, `--dv-text-faint`, `--dv-scrim` | What components consume. |
| Status | `--dv-ok`, `--dv-warn`, `--dv-danger`, `--dv-info`, `--dv-add` / `--dv-change` / `--dv-remove` + `*-soft` | Diff colours are re-exported here so the restore diff and badges agree. |
| Accent | `--dv-accent`, `--dv-accent-hover`, `--dv-accent-soft`, `--dv-brand-gradient`, `--dv-ring`, `--dv-glow`, `--dv-focus` | Gradient is reserved for the primary CTA / brand mark only. |
| Geometry | `--dv-space-1…8`, `--dv-radius-sm…xl`, `--dv-shadow-xs…lg` | 4-pt spacing scale, 6/10/14/18 px radii, three elevation steps (+ modal). |
| Type | `--dv-font`, `--dv-mono` | Host `--dsw-font-family*` first, then Inter / PingFang SC / Segoe UI / system stack. |

### Theming

- **Default = dark.** The root paints a subtle dual radial glow over
  `--dv-bg`.
- **Light** = `.dsh-vault-root[data-dv-theme='light']`, toggled by `VaultApp`
  (Settings → Appearance: *Follow dsh / Dark / Light*; stored in
  `dsh-vault.theme`).
- **Follow dsh**: `VaultApp` observes `<html data-theme>` / `data-dsw-theme`,
  falling back to `prefers-color-scheme`.
- Host `--dsw-*` tokens are used as adaptive fallbacks so the panel blends into
  the host shell while keeping its own spacing/elevation.
- Motion respects `prefers-reduced-motion`.

Contrast was checked programmatically against every panel in both themes:
body text ≥ 4.5:1 and the lowest tier (`--dv-text-faint`) ≥ 4.5:1 on surface.

### Responsive

- ≥ 760 px: fixed sidebar (232 px) + scrolling workspace.
- < 760 px: sidebar collapses into a scrollable pill navigation under the
  brand; grids collapse to one column.
- Panel grids use **container queries** (`dv-workspace`), so they stack by the
  settings pane's real width, not the viewport. Tables that must keep their
  columns sit in horizontal scrollers with a min-width.

---

## 3. Component structure

```
src/client/
  index.ts                 # Cordis apply(); registers settings.section + full zh/en dictionary
  VaultApp.tsx             # Shell: sidebar nav, i18n/theme providers, API orchestration, progress
  api.ts                   # VaultApi (unchanged endpoints; additive optional body fields)
  theme.css                # tokens + component styles (all `.dv-*`)
  i18n.ts                  # zh/en dictionaries, translate(), I18nContext, useT()/useLocale()
  lib/
    format.ts              # bytes, dates, relative time, intervals, passwordStrength()
    targets.ts             # target labels/locations, secret redaction helpers
    useNow.ts              # minute ticker for relative timestamps
  components/
    ui.tsx                 # shared primitives (below)
    Icons.tsx              # ~55 inline SVG icons (no icon dependency)
    Dashboard.tsx          # Overview
    BackupPanel.tsx        # Backup
    RestorePanel.tsx       # Restore
    StoragePanel.tsx       # Storage targets
    SnapshotsPanel.tsx     # Snapshots
    SettingsPanel.tsx      # Settings
```

### Primitives (`components/ui.tsx`)

| Component | Purpose |
|---|---|
| `PageHeader` | Title / subtitle / actions row. |
| `Card`, `CardHeader`, `CardBody`, `CardFooter` | Surface with optional icon tile, hero tint, selected ring. |
| `Button`, `IconButton`, `CtaButton` | Variants `default · primary · ghost · outline · danger · danger-solid · ok · info`; sizes `sm · md · lg`; loading spinner + `aria-busy`. `CtaButton` is the gradient hero action. |
| `Field`, `TextInput`, `PasswordInput`, `TextArea`, `SelectField`, `Checkbox`, `Switch`, `OptionTile`, `Segmented`, `SearchInput` | Forms. `Field` always renders a `<label for>` plus hint or error text. `OptionTile` is a styled radio/checkbox that keeps the native input for keyboard/SR use. `PasswordInput` adds a show/hide toggle. |
| `Badge`, `StatusDot`, `Tag` | Pills and status indicators (`tone`: neutral/brand/ok/warn/danger/info/add/change/remove). |
| `Banner` | Inline alert, `data-tone="info|ok|warn|error"`; the contract's `data-tone` values are preserved. |
| `LoadingState`, `LoadingInline`, `SkeletonLines`, `SkeletonCard` | Loading. |
| `EmptyState` | Guided empty state with icon, copy and actions. |
| `ErrorState` | Error with message and Retry. |
| `ProgressBar` | Determinate/indeterminate bar with stage chips and `role="progressbar"`. |
| `Meter` | 4-segment password-strength meter. |
| `Stat` | KPI tile. |
| `Collapsible` | `<details>`-based disclosure. |
| `Dialog`, `ConfirmDialog` | Portal modal with focus trap, Escape, focus restore; `ConfirmDialog` is the standard destructive-action gate. |
| `CopyButton` | Copy-to-clipboard for ids and paths. |

### Icons

`Icons.tsx` holds small inline SVGs (24×24, `currentColor`, `1em` default
size). No icon package is added. `storageIcon(kind)` maps local / GitHub /
WebDAV / S3 to their icon.

---

## 4. Screens

| Tab | Component | Highlights |
|---|---|---|
| Overview | `Dashboard` | Last backup + relative age, snapshot count & size, schedule and encryption KPIs; one-click gradient **Back up now**; per-target status cards (kind, location, snapshot count, last backup, encryption) with “Back up here”; recent snapshots; environment paths. |
| Backup | `BackupPanel` | Scope tiles for all 10 `BackupCategory` values with select all/clear; target radio cards; encryption switch with strength meter (length + character-class heuristic), credentials switch locked until encryption is on; notes; summary card; stage progress bar; success/error banners. |
| Restore | `RestorePanel` | Step indicator ①…④. Snapshot picker (target filter + search). **Diff preview** with add/change/remove/unchanged colours, counts and filters. **Per-path conflict** radio pairs (use backup / keep current) + bulk set. Plugin reinstall and manual-action notices. **Double confirmation**: two checkboxes (rollback note, risk acknowledgement) plus a confirm dialog. Encrypted snapshots ask for the password inline. |
| Storage | `StoragePanel` | Target cards for local plaintext / local encrypted / GitHub / WebDAV / S3 with location, snapshot count, last backup, stored-credential and default-encryption tags. **Test connection** lists a target's snapshots read-only (`GET /snapshots?targetId=`), shows found count or a redacted error. Editor with labelled fields per kind, masked secrets, default-encryption switch, delete confirmation. |
| Snapshots | `SnapshotsPanel` | Totals, search, target filter and mode filter (all / encrypted / plaintext / with secrets). Verify per row (password dialog for encrypted snapshots), delete with confirmation, jump to Restore. Retention editor with a live “would prune ~N” preview. |
| Settings | `SettingsPanel` | Schedule enable switch, interval presets + custom minutes (min 15), target picker, encrypt / include-secrets, last/next run, **Run now**. Retention + preset chips, default target, preferred KDF, language (zh / en), appearance (follow dsh / dark / light), About block with data dirs and the secrets policy. Save is explicit with an “unsaved changes” badge and discard. |

### State coverage

| State | Where |
|---|---|
| loading | Dashboard full-page → skeletons/spinner; Snapshots/Settings loading states; Restore preview spinner. |
| empty | No targets, no snapshots, no search matches, nothing-to-restore — each with guidance and a next action. |
| error | Inline `Banner data-tone="error"` with Retry on data loads; dialog/row-level verify errors. |
| busy / progress | Primary actions disabled & spinners; backup stage progress; restore in-dialog progress. |
| success | `Banner data-tone="ok"` with snapshot id / counts / rollback id. |
| warn | Restore manual actions and removals; “no target” schedule warning. |

Because the HTTP API is request/response, backup/restore progress is
**optimistic**: `VaultApp` advances a time-based bar toward ~92% through named
stages and completes when the promise settles. If the backend later adds
progress streaming, only `VaultApp` needs to consume it.

---

## 5. Internationalisation

- `i18n.ts` ships complete `zh` and `en` dictionaries (same key set).
  **Chinese is the default**: a stored choice wins, then the host locale
  (`ctx.locale.getLocale().active`), then `navigator.language`.
- `VaultApp` provides `I18nContext`; components use `useT()` (translator) and
  `useLocale()` (date/interval formatting). Interpolation: `t('key', { n })`
  with `{n}` placeholders.
- The full dictionary is also registered with the host locale namespace
  (`dsh-vault`) in `index.ts`.
- The sidebar footer and Settings let users switch language at any time.

---

## 6. Data & API usage

The UI only calls the routes in the contract via `VaultApi`:

| Flow | Calls |
|---|---|
| Load | `GET /status`, `GET /snapshots` |
| Backup | `POST /backup` (`targetId`, `encrypt`, `password?`, `includeSecrets`, `notes?`) → `GET /status` + `/snapshots` |
| Restore | `POST /restore/preview` → `POST /restore` (`conflict` strategy) → refresh |
| Storage | `POST /targets` (upsert), `POST /targets/delete`; test = `GET /snapshots?targetId=` |
| Snapshots | `POST /verify`, `POST /snapshots/delete`; retention = `PUT /settings` |
| Settings | `PUT /settings`, `POST /schedule/run` |

**Known limitation:** `POST /restore` accepts one coarse `conflict` strategy.
The per-path conflict choices are collected in the UI (and forwarded as an
optional `conflicts` map in the panel callback) but are sent as the single
strategy today. Applying them per path needs a backend addition (e.g.
`conflictOverrides: Record<path, strategy>`); no backend code was changed in
this pass. `GET /targets` is not used because `/status` already returns
targets.

Secrets: backup passwords are never stored; the password is only used for the
in-flight request and for preview/verify of the selected session. Error text
shown for connection tests strips configured secret values.

---

## 7. Verification

```bash
npm run typecheck
npm run build
npm test
```

UI checks done during the redesign: every panel rendered to string in both
locales (zh/en) and in loading/empty/error/busy states; headless-Chrome layout
probe for horizontal overflow, clipped text and contrast at 1180 px and 390 px
widths in dark and light themes.
