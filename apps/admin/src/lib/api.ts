import { treaty } from '@elysia/eden'

import type { App } from '../../../api/src/app'
import type { Position, Weapon } from '../../../api/src/models/catalog'
import type { PlayerInput, PlayerProfile } from '../../../api/src/models/player'
import type { Tournament } from '../../../api/src/models/tournament'
import type {
  AdminTeam,
  AdminTeamInput,
  AdminTournamentInput,
} from '../../../api/src/models/admin'

export type {
  AdminTeam,
  AdminTeamInput,
  AdminTournamentInput,
  PlayerInput,
  PlayerProfile,
  Position,
  Tournament,
  Weapon,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function messageFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (Array.isArray(value)) {
    const messages = value.map(messageFromUnknown).filter((item): item is string => item !== null)
    return messages.length > 0 ? messages.join(' / ') : null
  }
  if (!isRecord(value)) return null

  for (const key of ['message', 'summary', 'error']) {
    const message = messageFromUnknown(value[key])
    if (message) return message
  }
  if ('value' in value && 'path' in value) {
    const path = typeof value.path === 'string' ? value.path : '入力値'
    const detail = messageFromUnknown(value.value)
    return detail ? `${path}: ${detail}` : `${path} を確認してください。`
  }
  return null
}

export class AdminApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminApiError'
  }
}

interface TreatyError {
  status: unknown
  value: unknown
}

interface TreatyResult<T> {
  data: T | null
  error: TreatyError | null
}

type MessagePayload = { message: string }
type SuccessfulPayload<T> = Exclude<T, MessagePayload>

async function unwrap<T>(request: Promise<TreatyResult<T>>): Promise<SuccessfulPayload<T>> {
  let result: TreatyResult<T>
  try {
    result = await request
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AdminApiError('API に接続できませんでした。起動状態と URL を確認してください。')
  }
  if (result.error) {
    throw new AdminApiError(
      messageFromUnknown(result.error.value) ?? `API エラー (${String(result.error.status)})`,
    )
  }
  if (result.data === null) throw new AdminApiError('API から空の応答が返されました。')
  if (isRecord(result.data) && typeof result.data.message === 'string') {
    throw new AdminApiError(result.data.message)
  }
  return result.data as SuccessfulPayload<T>
}

function createClient(baseUrl: string, token: string, signal: AbortSignal) {
  return treaty<App>(baseUrl, {
    headers: { authorization: `Bearer ${token}` },
    fetch: { signal },
  })
}

export class AdminApi {
  readonly #client: ReturnType<typeof createClient>

  constructor(baseUrl: string, token: string, signal: AbortSignal) {
    this.#client = createClient(baseUrl, token, signal)
  }

  status() {
    return unwrap(this.#client.admin.status.get())
  }

  players() {
    return unwrap(this.#client.admin.players.get())
  }

  positions() {
    return unwrap(this.#client.admin.positions.get())
  }

  tournaments() {
    return unwrap(this.#client.admin.tournaments.get())
  }

  teams(tournamentId: string) {
    return unwrap(this.#client.admin.tournaments({ id: tournamentId }).teams.get())
  }

  createPlayer(input: PlayerInput) {
    return unwrap(this.#client.admin.players.post(input))
  }

  updatePlayer(id: string, input: PlayerInput) {
    return unwrap(this.#client.admin.players({ id }).put(input))
  }

  createTournament(input: AdminTournamentInput) {
    return unwrap(this.#client.admin.tournaments.post(input))
  }

  updateTournament(id: string, input: AdminTournamentInput) {
    return unwrap(this.#client.admin.tournaments({ id }).put(input))
  }

  createTeam(tournamentId: string, input: AdminTeamInput) {
    return unwrap(this.#client.admin.tournaments({ id: tournamentId }).teams.post(input))
  }

  updateTeam(tournamentId: string, teamId: string, input: AdminTeamInput) {
    return unwrap(
      this.#client.admin.tournaments({ id: tournamentId }).teams({ teamId }).put(input),
    )
  }
}

export function loadWeapons(baseUrl: string, signal: AbortSignal) {
  return unwrap(treaty<App>(baseUrl, { fetch: { signal } }).weapons.get())
}

export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  if (error instanceof Error) return error.message
  return messageFromUnknown(error) ?? '予期しないエラーが発生しました。'
}
