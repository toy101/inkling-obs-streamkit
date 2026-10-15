import { useRef, useState } from 'react'

import { ConnectionPanel } from './components/ConnectionPanel'
import { PlayerPanel } from './components/PlayerPanel'
import { TournamentPanel } from './components/TournamentPanel'
import {
  AdminApi,
  errorMessage,
  loadWeapons,
  type AdminTeam,
  type PlayerProfile,
  type Position,
  type Tournament,
  type Weapon,
} from './lib/api'
import { readAdminTarget, targetConfigs } from './lib/config'

const config = targetConfigs[readAdminTarget(import.meta.env.VITE_ADMIN_TARGET)]

type View = 'tournaments' | 'players'

interface Session {
  api: AdminApi
  controller: AbortController
}

export default function App() {
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [view, setView] = useState<View>('tournaments')
  const [saving, setSaving] = useState(false)
  const [players, setPlayers] = useState<PlayerProfile[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [weapons, setWeapons] = useState<Weapon[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const selectedTournamentRef = useRef<string | null>(null)
  const teamsRequestRef = useRef(0)
  const [teamsLoading, setTeamsLoading] = useState(false)

  function clearData() {
    teamsRequestRef.current += 1
    setTeamsLoading(false)
    setPlayers([])
    setPositions([])
    setWeapons([])
    setTournaments([])
    setTeams([])
    setSelectedTournamentId(null)
    selectedTournamentRef.current = null
  }

  function closeSession() {
    sessionRef.current?.controller.abort()
    sessionRef.current = null
    setSession(null)
    setSaving(false)
    clearData()
  }

  function disconnect() {
    closeSession()
    setToken('')
    setConnectionError('')
  }

  async function connect() {
    const normalizedToken = token.trim()
    if (!normalizedToken) return
    closeSession()
    setConnecting(true)
    setConnectionError('')
    const controller = new AbortController()
    const nextSession: Session = {
      api: new AdminApi(config.apiUrl, normalizedToken, controller.signal),
      controller,
    }
    sessionRef.current = nextSession

    try {
      const status = await nextSession.api.status()
      if (status.environment !== config.id) {
        throw new Error(`接続先の環境が一致しません。起動設定: ${config.id} / API: ${status.environment}`)
      }
      const [nextPlayers, nextPositions, nextTournaments, nextWeapons] = await Promise.all([
        nextSession.api.players(),
        nextSession.api.positions(),
        nextSession.api.tournaments(),
        loadWeapons(config.apiUrl, controller.signal),
      ])
      if (sessionRef.current !== nextSession) return
      setPlayers(nextPlayers)
      setPositions(nextPositions)
      setTournaments(nextTournaments)
      setWeapons(nextWeapons)
      setSession(nextSession)
    } catch (error) {
      if (sessionRef.current === nextSession) {
        controller.abort()
        sessionRef.current = null
        setConnectionError(errorMessage(error))
      }
    } finally {
      if (sessionRef.current === nextSession || sessionRef.current === null) setConnecting(false)
    }
  }

  async function refreshPlayers(preferredId?: string) {
    void preferredId
    const current = sessionRef.current
    if (!current) return
    const result = await current.api.players()
    if (sessionRef.current === current) setPlayers(result)
  }

  function upsertPlayer(saved: PlayerProfile) {
    setPlayers((current) => current.some((player) => player.id === saved.id)
      ? current.map((player) => player.id === saved.id ? saved : player)
      : [...current, saved])
  }

  async function refreshTournaments(preferredId?: string) {
    void preferredId
    const current = sessionRef.current
    if (!current) return
    const result = await current.api.tournaments()
    if (sessionRef.current === current) setTournaments(result)
  }

  function upsertTournament(saved: Tournament) {
    setTournaments((current) => current.some((tournament) => tournament.id === saved.id)
      ? current.map((tournament) => tournament.id === saved.id ? saved : tournament)
      : [...current, saved])
  }

  async function refreshTeams(tournamentId: string, preferredId?: string) {
    void preferredId
    const current = sessionRef.current
    if (!current || selectedTournamentRef.current !== tournamentId) return
    const requestId = ++teamsRequestRef.current
    const result = await current.api.teams(tournamentId)
    if (sessionRef.current === current && selectedTournamentRef.current === tournamentId && teamsRequestRef.current === requestId) setTeams(result)
  }

  function upsertTeam(tournamentId: string, saved: AdminTeam) {
    if (selectedTournamentRef.current !== tournamentId) return
    teamsRequestRef.current += 1
    setTeamsLoading(false)
    setTeams((current) => current.some((team) => team.id === saved.id)
      ? current.map((team) => team.id === saved.id ? saved : team)
      : [...current, saved])
  }

  async function selectTournament(id: string | null) {
    const requestId = ++teamsRequestRef.current
    selectedTournamentRef.current = id
    setSelectedTournamentId(id)
    setTeams([])
    setTeamsLoading(false)
    if (!id) return
    const current = sessionRef.current
    if (!current) return
    setTeamsLoading(true)
    try {
      const result = await current.api.teams(id)
      if (sessionRef.current === current && selectedTournamentRef.current === id && teamsRequestRef.current === requestId) setTeams(result)
    } catch (error) {
      if (sessionRef.current === current && selectedTournamentRef.current === id && teamsRequestRef.current === requestId) {
        setConnectionError(errorMessage(error))
      }
    } finally {
      if (sessionRef.current === current && selectedTournamentRef.current === id && teamsRequestRef.current === requestId) setTeamsLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">INKLING.ADMIN</p>
          <h1>大会管理</h1>
        </div>
        {session && <span className={`header-target ${config.id}`}>{config.label} に接続中</span>}
      </header>

      <ConnectionPanel
        config={config}
        token={token}
        connecting={connecting}
        connected={session !== null}
        error={connectionError}
        onTokenChange={setToken}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      {session ? (
        <main>
          <nav className="main-nav" aria-label="管理メニュー">
            <button type="button" disabled={saving} className={view === 'tournaments' ? 'active' : ''} onClick={() => setView('tournaments')}>大会・チーム</button>
            <button type="button" disabled={saving} className={view === 'players' ? 'active' : ''} onClick={() => setView('players')}>参加者</button>
          </nav>

          {view === 'tournaments' ? (
            <TournamentPanel
              api={session.api}
              tournaments={tournaments}
              teams={teams}
              players={players}
              selectedTournamentId={selectedTournamentId}
              teamsLoading={teamsLoading}
              onBusyChange={(busy) => { if (sessionRef.current === session) setSaving(busy) }}
              onSelectTournament={(id) => { if (sessionRef.current === session) void selectTournament(id) }}
              onTournamentSaved={(saved) => { if (sessionRef.current === session) upsertTournament(saved) }}
              onTeamSaved={(id, saved) => { if (sessionRef.current === session) upsertTeam(id, saved) }}
              onRefreshTournaments={refreshTournaments}
              onRefreshTeams={refreshTeams}
            />
          ) : (
            <PlayerPanel
              api={session.api}
              players={players}
              positions={positions}
              weapons={weapons}
              onBusyChange={(busy) => { if (sessionRef.current === session) setSaving(busy) }}
              onSaved={(saved) => { if (sessionRef.current === session) upsertPlayer(saved) }}
              onRefresh={refreshPlayers}
            />
          )}
        </main>
      ) : (
        <main className="welcome-panel">
          <h2>大会データを管理</h2>
          <p>管理トークンを入力して接続してください。</p>
        </main>
      )}
    </div>
  )
}
