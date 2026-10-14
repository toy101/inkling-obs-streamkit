import { useMemo, useState } from 'react'

import type {
  AdminApi,
  AdminTeam,
  AdminTeamInput,
  AdminTournamentInput,
  PlayerProfile,
  Tournament,
} from '../lib/api'
import { errorMessage } from '../lib/api'

interface TournamentPanelProps {
  api: AdminApi
  tournaments: Tournament[]
  teams: AdminTeam[]
  players: PlayerProfile[]
  selectedTournamentId: string | null
  teamsLoading: boolean
  onBusyChange: (busy: boolean) => void
  onSelectTournament: (id: string | null) => void
  onTournamentSaved: (tournament: Tournament) => void
  onTeamSaved: (tournamentId: string, team: AdminTeam) => void
  onRefreshTournaments: (preferredId?: string) => Promise<void>
  onRefreshTeams: (tournamentId: string, preferredId?: string) => Promise<void>
}

const statusLabels: Record<Tournament['status'], string> = {
  draft: '下書き',
  registration: '参加受付中',
  locked: '確定',
  archived: 'アーカイブ',
}

const emptyTournament: AdminTournamentInput = { name: '', status: 'draft' }

type TeamForm = AdminTeamInput
type TeamStatus = AdminTeam['status']

const teamStatusLabels: Record<TeamStatus, string> = {
  draft: 'ドラフト',
  confirmed: '確定',
  hidden: '非表示',
}

function automaticTeamStatus(roster: TeamForm['roster']): Exclude<TeamStatus, 'hidden'> {
  const completedEntries = roster.filter((entry) => entry.registeredName.trim() !== '').length
  return completedEntries === 4 ? 'confirmed' : 'draft'
}

function updateAutomaticStatus(current: TeamForm, roster: TeamForm['roster']): TeamForm {
  return {
    ...current,
    status: current.status === 'hidden' ? 'hidden' : automaticTeamStatus(roster),
    roster,
  }
}

function emptyTeam(displayOrder: number): TeamForm {
  return {
    name: '',
    displayOrder,
    status: 'draft',
    roster: [{ id: null, registeredName: '', playerId: null }],
  }
}

export function TournamentPanel({
  api,
  tournaments,
  teams,
  players,
  selectedTournamentId,
  teamsLoading,
  onBusyChange,
  onSelectTournament,
  onTournamentSaved,
  onTeamSaved,
  onRefreshTournaments,
  onRefreshTeams,
}: TournamentPanelProps) {
  const selectedTournament = useMemo(
    () => tournaments.find((item) => item.id === selectedTournamentId) ?? null,
    [tournaments, selectedTournamentId],
  )
  const [tournamentForm, setTournamentForm] = useState<AdminTournamentInput>(() => selectedTournament
    ? { name: selectedTournament.name, status: selectedTournament.status }
    : emptyTournament)
  const [tournamentBusy, setTournamentBusy] = useState(false)
  const [tournamentMessage, setTournamentMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const selectedTeam = useMemo(() => teams.find((item) => item.id === selectedTeamId) ?? null, [teams, selectedTeamId])
  const [teamForm, setTeamForm] = useState<TeamForm>(() => emptyTeam(1))
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamMessage, setTeamMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const saving = tournamentBusy || teamBusy

  function selectTournament(id: string | null) {
    if (saving) return
    const next = tournaments.find((item) => item.id === id)
    setTournamentForm(next ? { name: next.name, status: next.status } : emptyTournament)
    setTournamentMessage(null)
    setSelectedTeamId(null)
    setTeamForm(emptyTeam(1))
    onSelectTournament(id)
  }

  async function submitTournament(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setTournamentMessage(null)
    const input = { ...tournamentForm, name: tournamentForm.name.trim() }
    if (!input.name) {
      setTournamentMessage({ kind: 'error', text: '大会名を入力してください。' })
      return
    }
    setTournamentBusy(true)
    onBusyChange(true)
    try {
      const saved = selectedTournament
        ? await api.updateTournament(selectedTournament.id, input)
        : await api.createTournament(input)
      onTournamentSaved(saved)
      onSelectTournament(saved.id)
      setTournamentForm({ name: saved.name, status: saved.status })
      const successText = selectedTournament ? '大会を更新しました。' : '大会を作成しました。'
      setTournamentMessage({ kind: 'success', text: successText })
      try {
        await onRefreshTournaments(saved.id)
      } catch {
        setTournamentMessage({ kind: 'success', text: `${successText} 保存済みですが、一覧の取得に失敗しました。` })
      }
    } catch (error) {
      const text = errorMessage(error)
      if (text) setTournamentMessage({ kind: 'error', text })
    } finally {
      setTournamentBusy(false)
      onBusyChange(false)
    }
  }

  function selectTeam(id: string | null) {
    if (saving) return
    setSelectedTeamId(id)
    setTeamMessage(null)
    const next = teams.find((team) => team.id === id)
    if (next) {
      setTeamForm({
        name: next.name,
        displayOrder: next.displayOrder,
        status: next.status,
        roster: next.roster.map((entry) => ({ id: entry.id, registeredName: entry.registeredName, playerId: entry.playerId })),
      })
    } else {
      const nextOrder = teams.reduce((maximum, team) => Math.max(maximum, team.displayOrder), 0) + 1
      setTeamForm(emptyTeam(nextOrder))
    }
  }

  function updateRoster(index: number, change: Partial<TeamForm['roster'][number]>) {
    setTeamForm((current) => {
      const roster = current.roster.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry
        const nextEntry = { ...entry, ...change }
        const linkedPlayer = change.playerId ? players.find((player) => player.id === change.playerId) : null
        if (linkedPlayer && nextEntry.registeredName.trim() === '') {
          nextEntry.registeredName = linkedPlayer.displayName
        }
        return nextEntry
      })
      return updateAutomaticStatus(current, roster)
    })
  }

  async function submitTeam(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setTeamMessage(null)
    if (!selectedTournament) return
    const input: AdminTeamInput = {
      ...teamForm,
      name: teamForm.name.trim(),
      roster: teamForm.roster.map((entry) => ({ ...entry, registeredName: entry.registeredName.trim() })),
    }
    if (input.status !== 'hidden') input.status = automaticTeamStatus(input.roster)
    if (!input.name) {
      setTeamMessage({ kind: 'error', text: 'チーム名を入力してください。' })
      return
    }
    if (input.roster.some((entry) => !entry.registeredName)) {
      setTeamMessage({ kind: 'error', text: '追加した参加枠には登録名を入力してください。' })
      return
    }
    const linkedPlayers = input.roster.flatMap((entry) => entry.playerId ? [entry.playerId] : [])
    if (new Set(linkedPlayers).size !== linkedPlayers.length) {
      setTeamMessage({ kind: 'error', text: '同じ参加者をチーム内で複数回選択できません。' })
      return
    }

    setTeamBusy(true)
    onBusyChange(true)
    try {
      const saved = selectedTeam
        ? await api.updateTeam(selectedTournament.id, selectedTeam.id, input)
        : await api.createTeam(selectedTournament.id, input)
      setSelectedTeamId(saved.id)
      setTeamForm({
        name: saved.name,
        displayOrder: saved.displayOrder,
        status: saved.status,
        roster: saved.roster.map((entry) => ({
          id: entry.id,
          registeredName: entry.registeredName,
          playerId: entry.playerId,
        })),
      })
      onTeamSaved(selectedTournament.id, saved)
      const successText = selectedTeam ? 'チームを更新しました。' : 'チームを登録しました。'
      setTeamMessage({ kind: 'success', text: successText })
      try {
        await onRefreshTeams(selectedTournament.id, saved.id)
      } catch {
        setTeamMessage({ kind: 'success', text: `${successText} 保存済みですが、一覧の取得に失敗しました。` })
      }
    } catch (error) {
      const text = errorMessage(error)
      if (text) setTeamMessage({ kind: 'error', text })
    } finally {
      setTeamBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="tournament-workspace">
      <aside className="record-list tournament-list">
        <div className="section-heading">
          <div><p className="eyebrow">Tournaments</p><h2>大会</h2></div>
          <button type="button" className="compact" disabled={saving} onClick={() => selectTournament(null)}>新規</button>
        </div>
        {tournaments.length === 0 ? <p className="empty-state">大会はまだ登録されていません。</p> : (
          <ul>
            {tournaments.map((tournament) => (
              <li key={tournament.id}>
                <button type="button" disabled={saving} className={selectedTournamentId === tournament.id ? 'selected' : ''} onClick={() => selectTournament(tournament.id)}>
                  <span><strong>{tournament.name}</strong><small>{statusLabels[tournament.status]}</small></span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="tournament-details">
        <section className="editor-card compact-editor">
          <div className="section-heading">
            <div><p className="eyebrow">Tournament</p><h2>{selectedTournament ? '大会を編集' : '大会を作成'}</h2></div>
            {selectedTournament && <span className="record-id">ID: {selectedTournament.id}</span>}
          </div>
          <form onSubmit={submitTournament}>
            <fieldset className="save-fields" disabled={saving}>
            <div className="form-grid two-columns">
              <label className="field"><span>大会名 <b>必須</b></span><input value={tournamentForm.name} onChange={(event) => setTournamentForm({ ...tournamentForm, name: event.target.value })} /></label>
              <label className="field"><span>大会の状態</span><select value={tournamentForm.status} onChange={(event) => setTournamentForm({ ...tournamentForm, status: event.target.value as Tournament['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            {tournamentMessage && <p className={`inline-message ${tournamentMessage.kind}`} role={tournamentMessage.kind === 'error' ? 'alert' : 'status'}>{tournamentMessage.text}</p>}
            <div className="form-actions"><button type="submit">{tournamentBusy ? '保存中…' : selectedTournament ? '大会を更新' : '大会を作成'}</button></div>
            </fieldset>
          </form>
        </section>

        {selectedTournament && (
          <section className="team-section">
            <div className="section-heading team-heading">
              <div><p className="eyebrow">Teams & roster</p><h2>大会チーム</h2></div>
              <button type="button" className="compact" disabled={saving || teamsLoading} onClick={() => selectTeam(null)}>新規チーム</button>
            </div>
            <div className="team-layout">
              <div className="team-cards">
                {teamsLoading ? <p className="empty-state">チームを読み込み中…</p> : teams.length === 0 ? <p className="empty-state">この大会にチームはありません。</p> : teams.map((team) => (
                  <button type="button" key={team.id} disabled={saving} className={`team-card ${selectedTeamId === team.id ? 'selected' : ''}`} onClick={() => selectTeam(team.id)}>
                    <span><strong>{team.name}</strong><small>表示順 {team.displayOrder}</small></span>
                    <span className={`team-status team-status-${team.status}`}>{teamStatusLabels[team.status]}</span>
                    <small className="roster-count">{team.roster.length}/4人</small>
                  </button>
                ))}
              </div>

              <form className="team-editor" onSubmit={submitTeam}>
                <fieldset className="save-fields" disabled={saving || teamsLoading}>
                <h3>{selectedTeam ? 'チームを編集' : 'チームを登録'}</h3>
                <div className="form-grid team-basics">
                  <label className="field"><span>チーム名 <b>必須</b></span><input value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} /></label>
                  <label className="field"><span>表示順</span><input type="number" min="1" value={teamForm.displayOrder} onChange={(event) => setTeamForm({ ...teamForm, displayOrder: Math.max(1, Number(event.target.value) || 1) })} /></label>
                  <label className="field team-status-field">
                    <span>チームの状態</span>
                    <select
                      value={teamForm.status === 'hidden' ? 'hidden' : automaticTeamStatus(teamForm.roster)}
                      onChange={(event) => setTeamForm({
                        ...teamForm,
                        status: event.target.value === 'hidden' ? 'hidden' : automaticTeamStatus(teamForm.roster),
                      })}
                    >
                      <option value={automaticTeamStatus(teamForm.roster)}>{teamStatusLabels[automaticTeamStatus(teamForm.roster)]}（人数で自動）</option>
                      <option value="hidden">非表示</option>
                    </select>
                    <small>4人揃うと確定になります。確定チームのみDockとOverlayに表示され、非表示でもデータは残ります。</small>
                  </label>
                </div>
                <fieldset className="roster-fieldset">
                  <legend>参加者 <small>{teamForm.roster.filter((entry) => entry.registeredName.trim() !== '').length}/4人登録済み</small></legend>
                  <div className="roster-list">
                    {teamForm.roster.map((entry, index) => (
                      <div className="roster-row" key={entry.id ?? `new-${index}`}>
                        <span className="roster-order">{index + 1}</span>
                        <label className="field"><span>登録名</span><input aria-label={`参加者 ${index + 1} 登録名`} value={entry.registeredName} onChange={(event) => updateRoster(index, { registeredName: event.target.value })} /></label>
                        <label className="field"><span>既存参加者との紐付け</span><select aria-label={`参加者 ${index + 1} 紐付け`} value={entry.playerId ?? ''} onChange={(event) => updateRoster(index, { playerId: event.target.value || null })}><option value="">紐付けなし</option>{players.map((player) => <option key={player.id} value={player.id} disabled={player.id !== entry.playerId && teamForm.roster.some((item) => item.playerId === player.id)}>{player.displayName}</option>)}</select></label>
                        <button type="button" className="icon-button" aria-label={`参加者 ${index + 1} を削除`} onClick={() => setTeamForm((current) => updateAutomaticStatus(current, current.roster.filter((_, entryIndex) => entryIndex !== index)))}>×</button>
                      </div>
                    ))}
                    {teamForm.roster.length < 4 && <button type="button" className="add-row" onClick={() => setTeamForm((current) => updateAutomaticStatus(current, [...current.roster, { id: null, registeredName: '', playerId: null }]))}>＋ 参加枠を追加</button>}
                  </div>
                </fieldset>
                {teamMessage && <p className={`inline-message ${teamMessage.kind}`} role={teamMessage.kind === 'error' ? 'alert' : 'status'}>{teamMessage.text}</p>}
                <div className="form-actions"><button type="submit">{teamBusy ? '保存中…' : selectedTeam ? 'チームを更新' : 'チームを登録'}</button></div>
                </fieldset>
              </form>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
