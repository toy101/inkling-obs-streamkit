import type { AdminTarget, TargetConfig } from '../lib/config'

interface ConnectionPanelProps {
  target: AdminTarget
  config: TargetConfig
  token: string
  connecting: boolean
  connected: boolean
  error: string
  onTargetChange: (target: AdminTarget) => void
  onTokenChange: (token: string) => void
  onConnect: () => void
  onDisconnect: () => void
}

export function ConnectionPanel({
  target,
  config,
  token,
  connecting,
  connected,
  error,
  onTargetChange,
  onTokenChange,
  onConnect,
  onDisconnect,
}: ConnectionPanelProps) {
  return (
    <section className={`connection-panel ${target === 'production' ? 'is-production' : ''}`}>
      <div className="connection-heading">
        <h2>接続設定</h2>
        <span className={`environment-badge ${target}`}>{config.label}</span>
      </div>

      {target === 'production' && (
        <p className="production-notice" role="alert">
          本番データへ接続します。保存内容は配信環境へ反映されます。
        </p>
      )}

      <div className="target-switch" aria-label="D1 接続先">
        <button
          type="button"
          className={target === 'local' ? 'active' : ''}
          aria-pressed={target === 'local'}
          onClick={() => onTargetChange('local')}
        >
          ローカル D1
        </button>
        <button
          type="button"
          className={target === 'production' ? 'active danger' : ''}
          aria-pressed={target === 'production'}
          onClick={() => onTargetChange('production')}
        >
          本番環境 D1
        </button>
      </div>

      <p className="api-url"><span>API URL</span><code>{config.apiUrl}</code></p>
      <label className="field">
        <span>管理トークン</span>
        <input
          type="password"
          value={token}
          autoComplete="off"
          placeholder="ADMIN_API_TOKEN"
          disabled={connected || connecting}
          onChange={(event) => onTokenChange(event.target.value)}
        />
        <small>この画面を開いている間だけ使用し、保存しません。</small>
      </label>

      <div className="connection-actions">
        {connected ? (
          <>
            <span className="connected-status"><span aria-hidden="true" />接続済み</span>
            <button type="button" className="secondary" onClick={onDisconnect}>切断</button>
          </>
        ) : (
          <button type="button" disabled={connecting || token.trim() === ''} onClick={onConnect}>
            {connecting ? '接続を確認中…' : '接続する'}
          </button>
        )}
      </div>

      {error && <p className="inline-message error" role="alert">{error}</p>}
    </section>
  )
}
