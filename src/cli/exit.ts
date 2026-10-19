/**
 * Exit code for `dsh-vault restore`. Files may have been applied while one or
 * more plugins failed to install; that must not look like success to scripts.
 */
export function restoreExitCode(result: { ok?: boolean }): number {
  return result.ok === false ? 2 : 0
}

export function restoreFailureSummary(result: {
  ok?: boolean
  pluginResults?: Array<{ name: string; profile?: string; status: string }>
}): string {
  if (result.ok !== false) return ''
  const failed = (result.pluginResults ?? []).filter((p) => p.status === 'failed')
  const names = failed.map((p) => (p.profile ? `${p.name} (${p.profile})` : p.name))
  return `restore incomplete: ${failed.length} plugin(s) failed${names.length ? `: ${names.join(', ')}` : ''}\n`
}
