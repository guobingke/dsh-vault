import { useState } from 'react'
import type { StorageKind, StorageTargetConfig } from '../../core/types.js'

export interface StoragePanelProps {
  targets: StorageTargetConfig[]
  busy: boolean
  error: string | null
  message: string | null
  onUpsert: (target: StorageTargetConfig) => void
  onDelete: (id: string) => void
}

export function StoragePanel({ targets, busy, error, message, onUpsert, onDelete }: StoragePanelProps) {
  const [kind, setKind] = useState<StorageKind>('local')
  const [id, setId] = useState('local-custom')
  const [label, setLabel] = useState('Custom local')
  const [directory, setDirectory] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [tokenCredential, setTokenCredential] = useState('GITHUB_TOKEN')
  const [webdavUrl, setWebdavUrl] = useState('')
  const [webdavUser, setWebdavUser] = useState('')
  const [webdavPass, setWebdavPass] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Key, setS3Key] = useState('')
  const [s3Secret, setS3Secret] = useState('')
  const [encryptByDefault, setEncryptByDefault] = useState(false)

  function submit() {
    let target: StorageTargetConfig
    if (kind === 'local') {
      target = { kind, id, label, directory, encryptByDefault }
    } else if (kind === 'github') {
      target = { kind, id, label, owner, repo, tokenCredential, encryptByDefault }
    } else if (kind === 'webdav') {
      target = {
        kind,
        id,
        label,
        url: webdavUrl,
        username: webdavUser || undefined,
        password: webdavPass || undefined,
        encryptByDefault,
      }
    } else {
      target = {
        kind: 's3',
        id,
        label,
        endpoint: s3Endpoint,
        bucket: s3Bucket,
        accessKeyId: s3Key,
        secretAccessKey: s3Secret,
        forcePathStyle: true,
        encryptByDefault,
      }
    }
    onUpsert(target)
  }

  return (
    <div className="dv-stack">
      <div>
        <h2 className="dv-h1">Storage targets</h2>
        <p className="dv-muted">Local, GitHub, WebDAV, or S3-compatible endpoints.</p>
      </div>
      {targets.length === 0 ? (
        <div className="dv-empty">No targets configured.</div>
      ) : (
        <table className="dv-table">
          <thead>
            <tr><th>Id</th><th>Kind</th><th>Label</th><th /></tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <td className="dv-mono">{t.id}</td>
                <td>{t.kind}</td>
                <td>{t.label}</td>
                <td>
                  <button type="button" className="dv-btn dv-btn-danger" disabled={busy} onClick={() => onDelete(t.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="dv-h1" style={{ fontSize: 13 }}>Add / update target</h3>
      <div className="dv-field">
        <label htmlFor="dv-kind">Kind</label>
        <select id="dv-kind" value={kind} onChange={(e) => setKind(e.target.value as StorageKind)}>
          <option value="local">Local</option>
          <option value="github">GitHub</option>
          <option value="webdav">WebDAV</option>
          <option value="s3">S3-compatible</option>
        </select>
      </div>
      <div className="dv-field">
        <label htmlFor="dv-id">Id</label>
        <input id="dv-id" value={id} onChange={(e) => setId(e.target.value)} />
      </div>
      <div className="dv-field">
        <label htmlFor="dv-label">Label</label>
        <input id="dv-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      {kind === 'local' ? (
        <div className="dv-field">
          <label htmlFor="dv-dir">Directory</label>
          <input id="dv-dir" value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder="~/dsh-vault-backups" />
        </div>
      ) : null}
      {kind === 'github' ? (
        <>
          <div className="dv-field">
            <label htmlFor="dv-owner">Owner</label>
            <input id="dv-owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-repo">Repo</label>
            <input id="dv-repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-cred">Token credential ref / env</label>
            <input id="dv-cred" value={tokenCredential} onChange={(e) => setTokenCredential(e.target.value)} />
          </div>
        </>
      ) : null}
      {kind === 'webdav' ? (
        <>
          <div className="dv-field">
            <label htmlFor="dv-wurl">URL</label>
            <input id="dv-wurl" value={webdavUrl} onChange={(e) => setWebdavUrl(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-wuser">Username</label>
            <input id="dv-wuser" value={webdavUser} onChange={(e) => setWebdavUser(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-wpass">Password</label>
            <input id="dv-wpass" type="password" value={webdavPass} onChange={(e) => setWebdavPass(e.target.value)} />
          </div>
        </>
      ) : null}
      {kind === 's3' ? (
        <>
          <div className="dv-field">
            <label htmlFor="dv-s3e">Endpoint</label>
            <input id="dv-s3e" value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-s3b">Bucket</label>
            <input id="dv-s3b" value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-s3k">Access key</label>
            <input id="dv-s3k" value={s3Key} onChange={(e) => setS3Key(e.target.value)} />
          </div>
          <div className="dv-field">
            <label htmlFor="dv-s3s">Secret key</label>
            <input id="dv-s3s" type="password" value={s3Secret} onChange={(e) => setS3Secret(e.target.value)} />
          </div>
        </>
      ) : null}
      <label className="dv-row">
        <input type="checkbox" checked={encryptByDefault} onChange={(e) => setEncryptByDefault(e.target.checked)} />
        Encrypt by default
      </label>
      {error ? <div className="dv-banner" data-tone="error">{error}</div> : null}
      {message ? <div className="dv-banner" data-tone="ok">{message}</div> : null}
      <button type="button" className="dv-btn dv-btn-primary" disabled={busy || !id} onClick={submit}>
        Save target
      </button>
    </div>
  )
}
