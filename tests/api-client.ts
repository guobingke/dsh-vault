import type { RouteGuard } from '../src/api/http.js'

/** Tests stand in for dsh's session check (a signed-in browser). */
export const allowAll: RouteGuard = { authorize: () => undefined }

/** fetch as the dsh-vault UI does: marker header + JSON content type. */
export function vaultFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'x-dsh-vault-request': '1',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}
