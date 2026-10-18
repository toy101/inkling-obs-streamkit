import { useMemo, useState } from 'react'

import { PLAYER_NAME_MAX_LENGTH } from '../../../api/src/models/player-name'
import type { AdminApi, PlayerInput, PlayerProfile, Position, Weapon } from '../lib/api'
import { errorMessage } from '../lib/api'

interface PlayerPanelProps {
  api: AdminApi
  players: PlayerProfile[]
  positions: Position[]
  weapons: Weapon[]
  onBusyChange: (busy: boolean) => void
  onSaved: (player: PlayerProfile) => void
  onRefresh: (preferredId?: string) => Promise<void>
}

const emptyForm: PlayerInput = {
  displayName: '',
  iconUrl: null,
  positionId: null,
  weaponIds: [],
}

export function PlayerPanel({ api, players, positions, weapons, onBusyChange, onSaved, onRefresh }: PlayerPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<PlayerInput>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const selected = useMemo(
    () => players.find((player) => player.id === selectedId) ?? null,
    [players, selectedId],
  )

  function selectPlayer(id: string | null) {
    if (busy) return
    setMessage(null)
    setSelectedId(id)
    const next = players.find((player) => player.id === id)
    setForm(next ? {
      displayName: next.displayName,
      iconUrl: next.iconUrl,
      positionId: next.position?.id ?? null,
      weaponIds: [...next.weaponIds],
    } : emptyForm)
  }

  function setWeapon(index: number, value: string) {
    setForm((current) => ({
      ...current,
      weaponIds: current.weaponIds.map((id, itemIndex) => itemIndex === index ? value : id),
    }))
  }

  function addWeapon() {
    const next = weapons.find((weapon) => !form.weaponIds.includes(weapon.id))
    if (next) setForm((current) => ({ ...current, weaponIds: [...current.weaponIds, next.id] }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setMessage(null)
    const displayName = form.displayName.trim()
    const duplicateWeapons = new Set(form.weaponIds).size !== form.weaponIds.length
    if (!displayName) {
      setMessage({ kind: 'error', text: '参加者名を入力してください。' })
      return
    }
    if (displayName.length > PLAYER_NAME_MAX_LENGTH) {
      setMessage({ kind: 'error', text: `参加者名は${PLAYER_NAME_MAX_LENGTH}文字以内で入力してください。` })
      return
    }
    if (duplicateWeapons) {
      setMessage({ kind: 'error', text: '同じブキは複数選択できません。' })
      return
    }

    const input: PlayerInput = {
      ...form,
      displayName,
      iconUrl: form.iconUrl?.trim() || null,
    }
    setBusy(true)
    onBusyChange(true)
    try {
      const saved = selectedId
        ? await api.updatePlayer(selectedId, input)
        : await api.createPlayer(input)
      setSelectedId(saved.id)
      setForm({
        displayName: saved.displayName,
        iconUrl: saved.iconUrl,
        positionId: saved.position?.id ?? null,
        weaponIds: [...saved.weaponIds],
      })
      onSaved(saved)
      const successText = selectedId ? '参加者を更新しました。' : '参加者を登録しました。'
      setMessage({ kind: 'success', text: successText })
      try {
        await onRefresh(saved.id)
      } catch {
        setMessage({ kind: 'success', text: `${successText} 保存済みですが、一覧の取得に失敗しました。` })
      }
    } catch (error) {
      const text = errorMessage(error)
      if (text) setMessage({ kind: 'error', text })
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="workspace-grid">
      <aside className="record-list">
        <div className="section-heading">
          <div><p className="eyebrow">Participants</p><h2>参加者</h2></div>
          <button type="button" className="compact" disabled={busy} onClick={() => selectPlayer(null)}>新規</button>
        </div>
        {players.length === 0 ? (
          <p className="empty-state">参加者はまだ登録されていません。</p>
        ) : (
          <ul>
            {players.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  disabled={busy}
                  className={selectedId === player.id ? 'selected' : ''}
                  onClick={() => selectPlayer(player.id)}
                >
                  <span className="avatar">{player.displayName.slice(0, 1)}</span>
                  <span><strong>{player.displayName}</strong><small>{player.position?.name ?? 'ポジション未設定'}</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="editor-card">
        <div className="section-heading">
          <div><p className="eyebrow">Player profile</p><h2>{selected ? '参加者を編集' : '参加者を登録'}</h2></div>
          {selected && <span className="record-id">ID: {selected.id}</span>}
        </div>
        <form onSubmit={submit}>
          <fieldset className="save-fields" disabled={busy}>
          <div className="form-grid two-columns">
            <label className="field">
              <span>参加者名 <b>必須</b></span>
              <input value={form.displayName} maxLength={PLAYER_NAME_MAX_LENGTH} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label className="field">
              <span>ポジション</span>
              <select value={form.positionId ?? ''} onChange={(event) => setForm({ ...form, positionId: event.target.value || null })}>
                <option value="">未設定</option>
                {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>アイコン URL</span>
            <input type="url" value={form.iconUrl ?? ''} placeholder="https://…" onChange={(event) => setForm({ ...form, iconUrl: event.target.value || null })} />
          </label>

          <fieldset>
            <legend>持ちブキ <small>{form.weaponIds.length}/4</small></legend>
            <div className="stacked-fields">
              {form.weaponIds.map((weaponId, index) => (
                <div className="inline-field" key={`${index}-${weaponId}`}>
                  <select aria-label={`持ちブキ ${index + 1}`} value={weaponId} onChange={(event) => setWeapon(index, event.target.value)}>
                    {weapons.map((weapon) => (
                      <option key={weapon.id} value={weapon.id} disabled={weapon.id !== weaponId && form.weaponIds.includes(weapon.id)}>{weapon.name}</option>
                    ))}
                  </select>
                  <button type="button" className="icon-button" aria-label={`持ちブキ ${index + 1} を削除`} onClick={() => setForm({ ...form, weaponIds: form.weaponIds.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
                </div>
              ))}
              {form.weaponIds.length < 4 && form.weaponIds.length < weapons.length && (
                <button type="button" className="add-row" onClick={addWeapon}>＋ ブキを追加</button>
              )}
            </div>
          </fieldset>

          {message && <p className={`inline-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
          <div className="form-actions">
            <button type="submit" disabled={busy}>{busy ? '保存中…' : selected ? '変更を保存' : '参加者を登録'}</button>
          </div>
          </fieldset>
        </form>
      </section>
    </div>
  )
}
