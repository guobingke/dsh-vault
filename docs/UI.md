# dsh-vault UI — native settings section

The dsh-vault interface is **part of the dsh Settings modal**, not a standalone
app. It registers one section (`settings.section`, id `dsh-vault`) and renders
into the modal's right content column (≈450–520 px, on `dsh web` and
DeepSeek Harness Desktop alike). The host owns the modal frame, the left
navigation ("dsh Vault" is one entry there), the colors and the light/dark
theme; the section only supplies its own content.

This document describes the design rules. It stays inside the boundary of
[`FRONTEND_CONTRACT.md`](./FRONTEND_CONTRACT.md): no backend, API or storage
code changed, every panel prop from the contract is still accepted, and every
API call is unchanged.

---

## 1. Principles

1. **Look like the host.** Rows, gray pickers, black primary buttons,
   provider cards, switches — the same shapes and tokens as dsh's own
   General / Models pages. Nothing in this section should read as "a plugin's
   own little app".
2. **No shell, no branding.** No sidebar, no logo, no "dsh Vault" brand block,
   no hero banner, no gradient / glow / shadow, no KPI tile grid, no
   decorative icons before headings, no theme switch (the host theme applies),
   no marketing copy.
3. **One flat hierarchy.** Section title → sub-section tabs → setting rows
   (or provider cards for grouped things). Everything else is plain text.
4. **Every state is designed.** Loading, empty, error, busy/progress and
   success are explicit and inline — never a blank panel.
5. **Safety stays visible.** Restore is preview → per-item conflicts →
   confirm dialog. Deleting a snapshot, deleting a storage location and
   restoring all go through a second confirmation.
6. **Secrets never echo.** Passwords, tokens and secret keys are masked
   (`type="password"` with a reveal toggle) and are never rendered back from
   saved configuration; leaving a secret field empty keeps the stored value.

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────┐
│ dsh Vault                                  16px, regular│
│ Back up and restore dsh plugins, …          14px, secondary│
│                                                          │
│ [Overview] [Backup] [Restore] [Storage] [Snapshots] [Auto backup]
│    ^selected = gray pill (bg-document-preview, radius 12) │
│                                                          │
│ Last backup                                  Local · today 10:21
│ ─────────────────────────────────────────────────────────│
│ Snapshots                      1 encrypted, 0 plaintext  │
│                                            5 · 12.4 MB   │
│ ─────────────────────────────────────────────────────────│
│ Auto backup                              daily, next …   │
│ ─────────────────────────────────────────────────────────│
│ ● Local           default        last today 10:21     3  │
│ ─────────────────────────────────────────────────────────│
│ Back up now                            [ Back up ] primary│
└──────────────────────────────────────────────────────────┘
```

- **Section head**: title 16 px / 24 px, weight 400, no icon; one plain
  description at 14 px in `label-secondary`.
- **Sub-section tabs**: a single row of small tabs, `role="tablist"`. Selected
  tab = `--dsw-alias-bg-document-preview` / radius 12; unselected = transparent.
  Roving tabindex + ←/→/Home/End keyboard support.
- **Setting row** (`SettingRow`):
  `display:flex; justify-content:space-between; align-items:center; padding:16px 0; gap:8px; border-bottom:1px solid border-l2` — the last row has no
  divider. Left column: title 14 px/22 px (`label-primary`) + description
  12 px/18 px (`label-tertiary`). Right column: the control. Rows whose
  control is wide (long selects, chip groups, inputs) use `stacked`, which
  puts the control below the text. Below 420 px rows stack automatically.
- **Provider card** (`Card`): `bg-module-platform`, radius 16, no shadow,
  padding 12–14. Used for storage locations, the backup target picker, the
  scope list, the restore snapshot picker, the diff and the conflict list.
  Cards are separated by 8 px; links inside a card are full-width picker
  buttons with a small chevron.

---

## 3. Tokens

All styling goes through `--dv-*` aliases defined on `.dsh-vault-root` in
`src/client/theme.css`, and every one maps onto a host `--dsw-*` token with a
light-theme fallback:

| Alias | Host token |
|---|---|
| `--dv-text` | `--dsw-alias-label-primary` |
| `--dv-text-secondary` / `-tertiary` / `-caption` | `--dsw-alias-label-secondary` / `-tertiary` / `-caption` |
| `--dv-bg-layer-1` / `-2` / `-3` | `--dsw-alias-bg-layer-1` / `-2` / `-3` |
| `--dv-bg-module` | `--dsw-alias-bg-module-platform` |
| `--dv-bg-selected` | `--dsw-alias-bg-document-preview` |
| `--dv-bg-skeleton` | `--dsw-alias-bg-skeleton` |
| `--dv-border-l1…l4` | `--dsw-alias-border-l1…l4` |
| `--dv-ok` / `-warn` / `-danger` / `-info` | `--dsw-alias-state-success/warn/error/business-primary` |
| `--dv-on-primary` | `--dsw-alias-bg-layer-3` |
| `--dv-focus` / `--dv-focus-width` | `--dsw-focus-ring-color` / `--dsw-focus-ring-width` |
| `--dv-radius-xs/sm/md/lg/xl` | `--dsw-radius-xs/sm/md/lg/xl` (4/8/12/16/20) |
| `--dv-font` / `--dv-mono` | `--dsw-font-family` / `--dsw-font-markdown-code-font-family` |
| `--dv-warn-bg` / `--dv-info-bg` | `--dsw-alias-state-warn-tertiary` / `--dsw-alias-state-business-tertiary` |

There is no own palette, gradient, shadow or glow. When the host switches
theme, the fallbacks are never used and every surface follows automatically.

### Controls

| Control | Appearance |
|---|---|
| Primary button | `label-primary` fill, `bg-layer-3` text (white on light, dark on dark), radius 12, `5px 14px`. Used for *Save*, *Back up*, *Create snapshot*, *Preview diff*, *Restore*. |
| Secondary button | `bg-layer-1` fill + 1 px `border-l3` (native Cancel). |
| Quiet / text button | transparent, `label-secondary`, gray hover. Used for row links (*Select all*, *Edit*, *Verify*…). |
| Danger button | neutral fill, `border-l3`, error-colored **text only**. A danger confirm (`danger-solid`) fills with `state-error-primary` and is only used inside the confirmation dialog. |
| Danger text | `state-error-primary`, used for inline error text and thin borders only — never as a large fill. |
| Dashed button | full-width (or wrapping) dashed `border-l3`, radius 12 — "+ Add storage location". |
| Select | native `<select>` restyled: `bg-module-platform`, radius 12, small chevron, 32 px high. |
| Input | white `bg-layer-1`, 1 px `border-l3`, radius 8, 32 px; numbers right-aligned in a 72 px field. |
| Switch | 28×16 capsule; on = `label-primary` fill, knob `bg-layer-3`. |
| Checkbox / radio tile | native inputs (keyboard + SR); custom 16 px mark. Tiles use `bg-module-platform` when selected, `border-l4`. |
| Chips | radius 12, 1 px border; pressed = `bg-module-platform` + `border-l4`. |
| Segmented | gray track, white segment for the active option (used for diff filter, per-item conflict choice, KDF). |
| Focus | `outline: var(--dv-focus-width) solid var(--dv-focus)` on every interactive element (`:focus-visible`), plus a ring on tile focus-within. |
| Status | 6 px dot (`success` / `warn` / `error` / `label-caption`) + text. |

---

## 4. Sub-sections

| Tab | Component | Content |
|---|---|---|
| Overview / `overview` | `Dashboard` → `Overview` | Plain status rows: **Last backup** (location · "today 10:21"), **Snapshots** (`5 · 12.4 MB`, "1 encrypted, 0 plaintext"), **Auto backup** ("daily, next tomorrow 10:21"), one dot+name row per storage location (`● Local … default … 3 snapshots`), then **Back up now** with its primary button on the right (uses the default location's settings; jumps to Storage when none exists). A one-line note states the credential policy. |
| Backup / `backup` | `BackupPanel` | Provider card for the storage location, card for the 10 backup categories (select all / clear), rows for *Encryption* (switch; password field, credentials switch and notes appear when on). Progress bar while running, success/error banners. |
| Restore / `restore` | `RestorePanel` | Snapshot picker card (location select + search, max 50) + password when encrypted → **Preview diff**. Diff card: counts, filter segmented, table (path / category / change / result). Conflict card: bulk *Use backup* / *Keep current* plus one segmented pair per changed item, with a summary ("3 use backup, 1 keep current"). Plugin list (`<details>`), manual-action banner. Confirmation rows: *Confirm*, *Rollback snapshot*, *Reinstall plugins*, then a danger **Restore** button that opens the confirmation dialog. Per-item choices are sent with `preview` (debounced) and with `restore` as `conflicts`; the global `conflict` remains `use-backup`. |
| Storage / `storage` | `StoragePanel` | One provider card per storage location: dot + name + id, kind, location, counts/last backup, tags (encrypt-by-default, stored credentials), *Test connection* / *Edit* / *Delete*, per-card test result. Add row with four dashed buttons (+ Add Local folder / GitHub / WebDAV / S3). Editor replaces the add row with fields per kind, native checkboxes/switches, *Cancel* / *Save*. Delete goes through the confirmation dialog. |
| Snapshots / `snapshots` | `SnapshotsPanel` | Search, location select, encryption segmented, count, refresh; plain list rows (id, location · date · size, tags, verify result) with *Restore* / *Verify* / *Delete* on the right. Encrypted verify asks for the password in a dialog. |
| Auto backup / `schedule` | `SettingsPanel` | Rows: *Enable auto backup*, *Interval* (preset chips + custom minutes), *Back up to*, *Encrypt*, *Include credentials*, *Last run*, *Run now*; *Retention* (keep last N + presets), *Default storage location*, *Key derivation*, and **Language** — a plain read-only row that follows the host locale (`Language — Simplified Chinese · Follow dsh`). Save / Discard at the bottom with an "Unsaved changes" hint. |

Language: the UI follows the host locale (`ctx.locale.getLocale().active`,
then `navigator.language`, then Simplified Chinese). There is no in-app
language or theme switch.

---

## 5. Files

```
src/client/
  index.ts          # Cordis apply(); registers settings.section
  VaultApp.tsx      # Section head + sub-section tabs + state orchestration
  api.ts            # VaultApi (unchanged endpoints)
  i18n.ts           # zh/en dictionaries (same key set), translate(), useT()
  theme.css         # --dv-* aliases of --dsw-* + section styles
  lib/
    format.ts       # bytes, dates ("today 10:21"), relative time, intervals, password strength
    targets.ts      # target labels/locations/counters (no secrets)
  components/
    ui.tsx          # SectionHead, SectionTabs, SettingRow, Card, Button, Select,
                    # Switch, Checkbox, OptionTile, Segmented, Chips, Banner,
                    # states, ProgressBar, Dialog, ConfirmDialog
    Icons.tsx       # only chevrons, alert mark and password reveal
    Dashboard.tsx   # Overview
    BackupPanel.tsx
    RestorePanel.tsx
    StoragePanel.tsx
    SnapshotsPanel.tsx
    SettingsPanel.tsx
```

`src/client` imports `src/core` **types only** (`import type`) so no
`node:*` module ever reaches the browser bundle, and it does not import host
primitive packages — the native look is reproduced locally from tokens.

---

## 6. States

| State | Where |
|---|---|
| loading | Overview / Auto backup / Snapshots / Storage show an inline spinner line. |
| empty | No storage locations (Overview, Backup, Restore), no snapshots, no search matches, nothing to restore — each with one sentence and a next action. |
| error | Inline error text / banner with `role="alert"`; retry on the Overview and Auto backup load. |
| busy / progress | Primary buttons disable and show a spinner; Backup shows an optimistic progress bar with a stage label. |
| success | Green-tinted `Banner tone="ok"` with snapshot id / counts / rollback id. |
| warn | Restore manual actions, removals note, unsaved-changes hint. |

Backup/restore progress is optimistic: the API is request/response, so
`VaultApp` advances the bar toward ~92 % through named stages and finishes
when the promise settles. Only `VaultApp` would change if the backend later
streamed progress.

---

## 7. Verification

```bash
npm run typecheck
npm run build
npm test
```

During this pass every panel was server-rendered in zh and en (loading,
empty, error, busy, populated) and exercised in headless Chrome at 460 px and
500 px content width in light and dark host themes: no horizontal overflow,
labels fit, tab keyboard navigation moves selection and focus, switches and
per-item conflict choices reach the API with the expected payloads, and
destructive actions require the confirmation dialog.
