import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

interface MockState {
  environment: 'local' | 'production'
  failNextPlayerSave: boolean
  failNextTournamentList?: boolean
  failTournamentRefreshAfterCreate?: boolean
  teamSaveRequested?: () => void
  teamSaveWait?: Promise<void>
  teamsResponse?: (tournamentId: string) => Promise<MockState['teams']>
  teamPutBodies?: Array<{
    name: string
    displayOrder: number
    status: 'draft' | 'confirmed' | 'hidden'
    roster: Array<{ id: string | null; registeredName: string; playerId: string | null }>
  }>
  players: Array<{
    id: string
    displayName: string
    iconUrl: string | null
    position: { id: string; name: string } | null
    weaponIds: string[]
  }>
  tournaments: Array<{
    id: string
    organizerUserId: string
    name: string
    status: 'draft' | 'registration' | 'locked' | 'archived'
    createdAt: string
    updatedAt: string
  }>
  teams: Array<{
    id: string
    tournamentId: string
    name: string
    displayOrder: number
    status: 'draft' | 'confirmed' | 'hidden'
    roster: Array<{
      id: string
      tournamentTeamId: string
      registeredName: string
      displayOrder: number
      playerId: string | null
    }>
  }>
}

const positions = [{ id: 'front', name: '前衛' }, { id: 'back', name: '後衛' }]
const weapons = [{ id: 'w1', name: 'スプラシューター' }, { id: 'w2', name: 'スプラチャージャー' }]

function normalizedTeamStatus(
  requested: MockState['teams'][number]['status'],
  rosterLength: number,
): MockState['teams'][number]['status'] {
  if (requested === 'hidden') return 'hidden'
  return rosterLength === 4 ? 'confirmed' : 'draft'
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockApi(page: Page, state: MockState, apiPort = 8787) {
  await page.route(`http://127.0.0.1:${apiPort}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path.startsWith('/admin/') && request.headers().authorization !== 'Bearer secret') {
      return json(route, { message: '管理トークンが正しくありません。' }, 401)
    }
    if (path === '/weapons') return json(route, weapons)
    if (path === '/admin/status') {
      return json(route, { environment: state.environment })
    }
    if (path === '/admin/positions') return json(route, positions)
    if (path === '/admin/players' && method === 'GET') return json(route, state.players)
    if (path === '/admin/players' && method === 'POST') {
      if (state.failNextPlayerSave) {
        state.failNextPlayerSave = false
        return json(route, { message: '同名の参加者が登録されています。' }, 409)
      }
      const body = request.postDataJSON() as { displayName: string; iconUrl: string | null; positionId: string | null; weaponIds: string[] }
      const player = { id: `player-${state.players.length + 1}`, displayName: body.displayName, iconUrl: body.iconUrl, position: positions.find((item) => item.id === body.positionId) ?? null, weaponIds: body.weaponIds }
      state.players.push(player)
      return json(route, player, 201)
    }
    const playerMatch = path.match(/^\/admin\/players\/([^/]+)$/)
    if (playerMatch && method === 'PUT') {
      const body = request.postDataJSON() as { displayName: string; iconUrl: string | null; positionId: string | null; weaponIds: string[] }
      const index = state.players.findIndex((item) => item.id === playerMatch[1])
      const player = { ...state.players[index], displayName: body.displayName, iconUrl: body.iconUrl, position: positions.find((item) => item.id === body.positionId) ?? null, weaponIds: body.weaponIds }
      state.players[index] = player
      return json(route, player)
    }
    if (path === '/admin/tournaments' && method === 'GET') {
      if (state.failNextTournamentList) {
        state.failNextTournamentList = false
        return json(route, { message: '大会一覧を再取得できません。' }, 503)
      }
      return json(route, state.tournaments)
    }
    if (path === '/admin/tournaments' && method === 'POST') {
      const body = request.postDataJSON() as { name: string; status: MockState['tournaments'][number]['status'] }
      const tournament = { id: `tournament-${state.tournaments.length + 1}`, organizerUserId: 'admin', name: body.name, status: body.status, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' }
      state.tournaments.push(tournament)
      if (state.failTournamentRefreshAfterCreate) state.failNextTournamentList = true
      return json(route, tournament, 201)
    }
    const tournamentMatch = path.match(/^\/admin\/tournaments\/([^/]+)$/)
    if (tournamentMatch && method === 'PUT') {
      const body = request.postDataJSON() as { name: string; status: MockState['tournaments'][number]['status'] }
      const index = state.tournaments.findIndex((item) => item.id === tournamentMatch[1])
      state.tournaments[index] = { ...state.tournaments[index], ...body }
      return json(route, state.tournaments[index])
    }
    const teamsMatch = path.match(/^\/admin\/tournaments\/([^/]+)\/teams$/)
    if (teamsMatch && method === 'GET') {
      const teams = state.teamsResponse
        ? await state.teamsResponse(teamsMatch[1])
        : state.teams.filter((item) => item.tournamentId === teamsMatch[1])
      return json(route, teams)
    }
    if (teamsMatch && method === 'POST') {
      const body = request.postDataJSON() as NonNullable<MockState['teamPutBodies']>[number]
      const teamId = `team-${state.teams.length + 1}`
      const team = { id: teamId, tournamentId: teamsMatch[1], name: body.name, displayOrder: body.displayOrder, status: normalizedTeamStatus(body.status, body.roster.length), roster: body.roster.map((entry, index) => ({ id: entry.id ?? `${teamId}-roster-${index + 1}`, tournamentTeamId: teamId, registeredName: entry.registeredName, displayOrder: index + 1, playerId: entry.playerId })) }
      state.teams.push(team)
      return json(route, team, 201)
    }
    const teamMatch = path.match(/^\/admin\/tournaments\/([^/]+)\/teams\/([^/]+)$/)
    if (teamMatch && method === 'PUT') {
      state.teamSaveRequested?.()
      await state.teamSaveWait
      const body = request.postDataJSON() as NonNullable<MockState['teamPutBodies']>[number]
      state.teamPutBodies?.push(body)
      const index = state.teams.findIndex((item) => item.id === teamMatch[2] && item.tournamentId === teamMatch[1])
      const current = state.teams[index]
      const team = {
        ...current,
        name: body.name,
        displayOrder: body.displayOrder,
        status: normalizedTeamStatus(body.status, body.roster.length),
        roster: body.roster.map((entry, rosterIndex) => ({
          id: entry.id ?? `${current.id}-roster-${rosterIndex + 1}`,
          tournamentTeamId: current.id,
          registeredName: entry.registeredName,
          displayOrder: rosterIndex + 1,
          playerId: entry.playerId,
        })),
      }
      state.teams[index] = team
      return json(route, team)
    }
    return json(route, { message: `Unhandled ${method} ${path}` }, 404)
  })
}

async function connect(page: Page) {
  await page.goto('/')
  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await expect(page.getByText('接続済み')).toBeVisible()
}

async function insertText(page: Page, input: Locator, text: string) {
  await input.focus()
  await page.keyboard.insertText(text)
}

test('参加者を登録・編集し、再接続後も一覧へ反映する', async ({ page }) => {
  const state: MockState = { environment: 'local', failNextPlayerSave: false, players: [], tournaments: [], teams: [] }
  await mockApi(page, state)
  await connect(page)
  await page.getByRole('button', { name: '参加者', exact: true }).click()
  const playerNameInput = page.getByLabel('参加者名 必須')
  const playerNameAtLimit = 'あ'.repeat(20)
  await expect(playerNameInput).toHaveAttribute('maxlength', '20')
  await insertText(page, playerNameInput, playerNameAtLimit)
  await expect(playerNameInput).toHaveValue(playerNameAtLimit)
  await playerNameInput.fill('')
  await insertText(page, playerNameInput, `${playerNameAtLimit}い`)
  await expect(playerNameInput).toHaveValue(playerNameAtLimit)
  await playerNameInput.fill('ヤチヨ')
  await page.getByLabel('ポジション').selectOption('front')
  await page.getByRole('button', { name: 'ブキを追加' }).click()
  await page.getByRole('button', { name: '参加者を登録' }).click()
  await expect(page.getByText('参加者を登録しました。')).toBeVisible()

  await page.getByLabel('参加者名 必須').fill('ヤチヨ改')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByText('参加者を更新しました。')).toBeVisible()

  await page.reload()
  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await page.getByRole('button', { name: '参加者', exact: true }).click()
  await expect(page.getByRole('button', { name: /ヤチヨ改/ })).toBeVisible()
})

test('既存の20文字超の名前は切り捨てず、保存時に修正を求める', async ({ page }) => {
  const longPlayerName = '参'.repeat(21)
  const longRegisteredName = '登'.repeat(21)
  const state: MockState = {
    environment: 'local',
    failNextPlayerSave: false,
    players: [{ id: 'p1', displayName: longPlayerName, iconUrl: null, position: null, weaponIds: [] }],
    tournaments: [{
      id: 't1', organizerUserId: 'owner-1', name: '既存大会', status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    teams: [{
      id: 'team1', tournamentId: 't1', name: '既存チーム', displayOrder: 1, status: 'draft',
      roster: [{
        id: 'roster1', tournamentTeamId: 'team1', registeredName: longRegisteredName,
        displayOrder: 1, playerId: 'p1',
      }],
    }],
  }
  await mockApi(page, state)
  await connect(page)

  await page.getByRole('button', { name: '参加者', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(longPlayerName) }).click()
  await expect(page.getByLabel('参加者名 必須')).toHaveValue(longPlayerName)
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByRole('alert')).toHaveText('参加者名は20文字以内で入力してください。')
  await expect(page.getByLabel('参加者名 必須')).toHaveValue(longPlayerName)

  await page.getByRole('button', { name: '大会・チーム', exact: true }).click()
  await page.getByRole('button', { name: /既存大会/ }).click()
  await page.getByRole('button', { name: /既存チーム 表示順/ }).click()
  await expect(page.getByLabel('参加者 1 登録名')).toHaveValue(longRegisteredName)
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await expect(page.getByRole('alert')).toHaveText('登録名は20文字以内で入力してください。')
  await expect(page.getByLabel('参加者 1 登録名')).toHaveValue(longRegisteredName)
})

test('保存失敗をフォーム内に表示し、重複ブキを選べない', async ({ page }) => {
  const state: MockState = { environment: 'local', failNextPlayerSave: true, players: [], tournaments: [], teams: [] }
  await mockApi(page, state)
  await connect(page)
  await page.getByRole('button', { name: '参加者', exact: true }).click()
  await page.getByLabel('参加者名 必須').fill('重複ユーザー')
  await page.getByRole('button', { name: 'ブキを追加' }).click()
  await page.getByRole('button', { name: 'ブキを追加' }).click()
  const secondWeapon = page.getByLabel('持ちブキ 2')
  await expect(secondWeapon.locator('option[value="w1"]')).toBeDisabled()
  await page.getByRole('button', { name: '参加者を登録' }).click()
  await expect(page.getByRole('alert')).toContainText('同名の参加者が登録されています。')
})

test('起動時のローカル接続先を表示し、APIの環境不一致を拒否する', async ({ page }) => {
  const state: MockState = { environment: 'production', failNextPlayerSave: false, players: [], tournaments: [], teams: [] }
  await mockApi(page, state)
  await page.goto('/')
  await expect(page.locator('.environment-badge')).toHaveText('ローカル D1')
  await expect(page.locator('.api-url code')).toHaveText('http://127.0.0.1:8787')
  await expect(page.getByRole('button', { name: 'ローカル D1', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '本番環境 D1', exact: true })).toHaveCount(0)
  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await expect(page.getByRole('alert')).toContainText('接続先の環境が一致しません。起動設定: local / API: production')
  await expect(page.getByText('接続済み', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '大会を作成' })).toHaveCount(0)
})

test('本番指定で起動すると本番接続先を維持して登録できる', async ({ page }) => {
  const state: MockState = { environment: 'production', failNextPlayerSave: false, players: [], tournaments: [], teams: [] }
  const unexpectedRequests: string[] = []
  await mockApi(page, state, 3000)
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    unexpectedRequests.push(route.request().url())
    await route.abort()
  })
  await page.goto('http://127.0.0.1:5176/')
  await expect(page.locator('.environment-badge')).toHaveText('本番環境 D1')
  await expect(page.locator('.api-url code')).toHaveText('http://127.0.0.1:3000')
  await expect(page.getByRole('button', { name: 'ローカル D1', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '本番環境 D1', exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('本番データへ接続します')
  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await expect(page.getByText('本番環境 D1 に接続中')).toBeVisible()
  await page.getByLabel('大会名 必須').fill('本番接続の確認大会')
  await page.getByRole('button', { name: '大会を作成' }).click()
  await expect(page.getByText('大会を作成しました。')).toBeVisible()
  expect(state.tournaments.map((tournament) => tournament.name)).toEqual(['本番接続の確認大会'])
  expect(unexpectedRequests).toEqual([])

  await page.reload()
  await expect(page.locator('.environment-badge')).toHaveText('本番環境 D1')
  await expect(page.getByLabel('管理トークン')).toHaveValue('')
  await expect(page.getByText('接続済み', { exact: true })).toHaveCount(0)
})


test('チームの同一参加者を複数枠へ割り当てられない', async ({ page }) => {
  const state: MockState = {
    environment: 'local',
    failNextPlayerSave: false,
    players: [{ id: 'p1', displayName: 'Player 1', iconUrl: null, position: null, weaponIds: [] }],
    tournaments: [{ id: 't1', organizerUserId: 'admin', name: '大会 1', status: 'draft', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' }],
    teams: [],
  }
  await mockApi(page, state)
  await connect(page)
  await page.getByRole('button', { name: /大会 1/ }).click()
  await page.getByRole('button', { name: '参加枠を追加' }).click()
  await page.getByLabel('参加者 1 紐付け').selectOption('p1')
  await expect(page.getByLabel('参加者 2 紐付け').locator('option[value="p1"]')).toHaveAttribute('disabled', '')
  await expect(page.locator('.roster-fieldset legend')).toContainText('1/4人登録済み')
  await expect(page.getByLabel('チームの状態')).toHaveValue('draft')
})

test('チームの人数と非表示操作から状態を保存し、再接続後もロスターIDを維持する', async ({ page }) => {
  const teamPutBodies: NonNullable<MockState['teamPutBodies']> = []
  const state: MockState = {
    environment: 'local',
    failNextPlayerSave: false,
    teamPutBodies,
    players: Array.from({ length: 4 }, (_, index) => ({
      id: `p${index + 1}`,
      displayName: `Player ${index + 1}`,
      iconUrl: null,
      position: null,
      weaponIds: [],
    })),
    tournaments: [],
    teams: [],
  }
  await mockApi(page, state)
  await connect(page)

  await page.getByLabel('大会名 必須').fill('ツクヨミ杯')
  await page.getByLabel('大会の状態').selectOption('registration')
  await page.getByRole('button', { name: '大会を作成' }).click()
  await expect(page.getByText('大会を作成しました。')).toBeVisible()

  await page.getByLabel('大会名 必須').fill('ツクヨミ杯 Final')
  await page.getByLabel('大会の状態').selectOption('locked')
  await page.getByRole('button', { name: '大会を更新' }).click()
  await expect(page.getByText('大会を更新しました。')).toBeVisible()

  await page.getByRole('button', { name: '参加者', exact: true }).click()
  await page.getByRole('button', { name: '大会・チーム', exact: true }).click()
  await expect(page.getByLabel('大会名 必須')).toHaveValue('ツクヨミ杯 Final')
  await expect(page.getByLabel('大会の状態')).toHaveValue('locked')

  await page.getByLabel('チーム名 必須').fill('月影')
  await page.getByLabel('表示順').fill('2')
  for (let index = 1; index <= 3; index += 1) {
    if (index > 1) await page.getByRole('button', { name: '参加枠を追加' }).click()
    await page.getByLabel(`参加者 ${index} 登録名`).fill(`登録名 ${index}`)
    await page.getByLabel(`参加者 ${index} 紐付け`).selectOption(`p${index}`)
  }
  await expect(page.getByLabel('チームの状態')).toHaveValue('draft')
  await page.getByRole('button', { name: 'チームを登録' }).click()
  await expect(page.getByText('チームを登録しました。')).toBeVisible()
  await expect(page.getByRole('button', { name: /月影.*ドラフト.*3\/4人/ })).toBeVisible()

  const firstThreeRosterIds = state.teams[0].roster.map((entry) => entry.id)
  await page.getByRole('button', { name: '参加枠を追加' }).click()
  await page.getByLabel('参加者 4 登録名').fill('登録名 4')
  await page.getByLabel('参加者 4 紐付け').selectOption('p4')
  await expect(page.getByLabel('チームの状態')).toHaveValue('confirmed')
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await expect(page.getByRole('button', { name: /月影.*確定.*4\/4人/ })).toBeVisible()

  await page.getByLabel('チームの状態').selectOption('hidden')
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await expect(page.getByRole('button', { name: /月影.*非表示.*4\/4人/ })).toBeVisible()
  await page.getByLabel('参加者 1 登録名').fill('非表示のまま編集')
  await expect(page.getByLabel('チームの状態')).toHaveValue('hidden')

  await page.getByLabel('チームの状態').selectOption('confirmed')
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await expect(page.getByRole('button', { name: /月影.*確定.*4\/4人/ })).toBeVisible()

  await page.getByRole('button', { name: '参加者 4 を削除' }).click()
  await expect(page.getByLabel('チームの状態')).toHaveValue('draft')
  await page.getByLabel('チーム名 必須').fill('月影・改')
  await page.getByLabel('表示順').fill('4')
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await expect(page.getByText('チームを更新しました。')).toBeVisible()
  await expect(page.getByRole('button', { name: /月影・改.*ドラフト.*3\/4人/ })).toBeVisible()
  expect(teamPutBodies).toHaveLength(4)
  expect(teamPutBodies.map((body) => body.status)).toEqual(['confirmed', 'hidden', 'confirmed', 'draft'])
  expect(teamPutBodies[3].roster.map((entry) => entry.id)).toEqual(firstThreeRosterIds)
  expect(teamPutBodies[3]).toMatchObject({ name: '月影・改', displayOrder: 4, status: 'draft' })

  await page.getByRole('button', { name: '切断' }).click()
  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await page.getByRole('button', { name: /ツクヨミ杯 Final/ }).click()
  await expect(page.getByRole('button', { name: /月影・改.*ドラフト.*3\/4人/ })).toBeVisible()
})

test('切断時に資格情報と編集内容を破棄し、起動時の接続先を維持する', async ({ page }) => {
  const state: MockState = { environment: 'local', failNextPlayerSave: false, players: [], tournaments: [], teams: [] }
  await mockApi(page, state)
  await connect(page)
  await page.getByLabel('大会名 必須').fill('未保存の大会')
  await page.getByRole('button', { name: '切断', exact: true }).click()
  await expect(page.getByLabel('管理トークン')).toHaveValue('')
  await expect(page.getByRole('button', { name: '大会を作成' })).toHaveCount(0)
  await expect(page.locator('.environment-badge')).toHaveText('ローカル D1')

  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await expect(page.getByText('ローカル D1 に接続中')).toBeVisible()
  await expect(page.getByLabel('大会名 必須')).toHaveValue('')
  expect(state.tournaments).toEqual([])
})


test('大会保存後の一覧再取得が失敗しても保存済み応答を保持し、重複作成しない', async ({ page }) => {
  const state: MockState = {
    environment: 'local',
    failNextPlayerSave: false,
    failTournamentRefreshAfterCreate: true,
    players: [],
    tournaments: [],
    teams: [],
  }
  await mockApi(page, state)
  await connect(page)
  await page.getByLabel('大会名 必須').fill('再取得失敗テスト')
  await page.getByRole('button', { name: '大会を作成' }).click()

  await expect(page.getByText(/保存済みですが、一覧の取得に失敗しました/)).toBeVisible()
  await expect(page.getByRole('button', { name: '大会を更新' })).toBeVisible()
  await expect(page.getByRole('button', { name: /再取得失敗テスト/ })).toBeVisible()

  await page.getByLabel('大会名 必須').fill('再取得失敗テスト・更新')
  await page.getByRole('button', { name: '大会を更新' }).click()
  expect(state.tournaments).toHaveLength(1)
  expect(state.tournaments[0].name).toBe('再取得失敗テスト・更新')
})

for (const teamsRefreshFails of [false, true]) {
  test(`大会保存後にチーム編集状態を初期化する（チーム再取得${teamsRefreshFails ? '失敗' : '成功'}）`, async ({ page }) => {
    const state: MockState = {
      environment: 'local', failNextPlayerSave: false, players: [],
      tournaments: [{
        id: 't1', organizerUserId: 'admin', name: '編集テスト大会', status: 'draft',
        createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z',
      }],
      teams: [{
        id: 'team1', tournamentId: 't1', name: '既存チーム', displayOrder: 7, status: 'hidden',
        roster: [{ id: 'roster1', tournamentTeamId: 'team1', registeredName: '既存参加者', displayOrder: 1, playerId: null }],
      }],
    }
    await mockApi(page, state)
    await connect(page)
    await page.getByRole('button', { name: /編集テスト大会/ }).click()
    await page.getByRole('button', { name: /既存チーム 表示順/ }).click()
    await expect(page.getByRole('heading', { name: 'チームを編集', exact: true })).toBeVisible()
    await page.getByLabel('チーム名 必須').fill('')
    await page.getByRole('button', { name: 'チームを更新' }).click()
    await expect(page.getByText('チーム名を入力してください。')).toBeVisible()
    await page.getByLabel('チーム名 必須').fill('既存チーム')

    if (teamsRefreshFails) {
      await page.route('http://127.0.0.1:8787/admin/tournaments/t1/teams', (route) => {
        if (route.request().method() === 'GET') {
          return json(route, { message: 'チーム一覧を再取得できません。' }, 503)
        }
        return route.fallback()
      })
    }
    await page.getByLabel('大会名 必須').fill('編集テスト大会・更新')
    await page.getByRole('button', { name: '大会を更新' }).click()
    await expect(page.getByText('大会を更新しました。')).toBeVisible()
    if (teamsRefreshFails) {
      await expect(page.getByText('チーム一覧を再取得できません。', { exact: true })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: /既存チーム 表示順/ })).toBeVisible()
    }
    await expect(page.getByLabel('チーム名 必須')).toBeEnabled()
    await expect(page.getByLabel('チーム名 必須')).toHaveValue('')
    await expect(page.getByLabel('表示順')).toHaveValue('1')
    await expect(page.getByLabel('チームの状態')).toHaveValue('draft')
    await expect(page.getByLabel('参加者 1 登録名')).toHaveValue('')
    await expect(page.getByText('チーム名を入力してください。')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'チームを登録', exact: true })).toBeVisible()

    await page.getByLabel('表示順').fill('8')
    await page.getByRole('button', { name: 'チームを登録', exact: true }).click()
    await expect(page.getByText('チーム名を入力してください。')).toBeVisible()
    expect(state.teams).toHaveLength(1)
    expect(state.teams[0]).toMatchObject({ id: 'team1', name: '既存チーム', displayOrder: 7, status: 'hidden' })
  })
}

test('チームの保存中は大会・チーム・編集画面の切替を防ぐ', async ({ page }) => {
  let releaseSave = () => {}
  const teamSaveWait = new Promise<void>((resolve) => { releaseSave = resolve })
  let markRequested = () => {}
  const saveRequested = new Promise<void>((resolve) => { markRequested = resolve })
  const state: MockState = {
    environment: 'local', failNextPlayerSave: false,
    teamSaveWait, teamSaveRequested: markRequested, players: [],
    tournaments: ['A', 'B'].map((letter) => ({
      id: letter, organizerUserId: 'admin', name: `大会${letter}`, status: 'draft',
      createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
    })),
    teams: ['1', '2'].map((number) => ({
      id: `team${number}`, tournamentId: 'A', name: `チーム${number}`,
      displayOrder: Number(number), status: 'draft' as const, roster: [],
    })),
  }
  await mockApi(page, state)
  await connect(page)
  await page.getByRole('button', { name: /大会A/ }).click()
  await page.getByRole('button', { name: /チーム1 表示順/ }).click()
  await page.getByLabel('チーム名 必須').fill('チーム1・更新済')
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await saveRequested
  try {
    await expect(page.getByRole('button', { name: /大会B/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: /チーム2 表示順/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: '新規チーム' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '参加者', exact: true })).toBeDisabled()
    await expect(page.getByLabel('チーム名 必須')).toBeDisabled()
  } finally {
    releaseSave()
  }
  await expect(page.getByText('チームを更新しました。')).toBeVisible()
  await page.getByRole('button', { name: /大会B/ }).click()
  await expect(page.getByLabel('大会名 必須')).toHaveValue('大会B')
  await expect(page.getByLabel('チーム名 必須')).toHaveValue('')
  expect(state.teams).toHaveLength(2)
  expect(state.teams[0].name).toBe('チーム1・更新済')
})

test('大会を往復して保存した後も古いチーム一覧の遅延応答で上書きしない', async ({ page }) => {
  let releaseOldTeams = () => {}
  const oldTeamsWait = new Promise<void>((resolve) => { releaseOldTeams = resolve })
  let markOldRequested = () => {}
  const oldRequested = new Promise<void>((resolve) => { markOldRequested = resolve })
  let requestsForA = 0
  const state: MockState = {
    environment: 'local', failNextPlayerSave: false, players: [],
    tournaments: ['A', 'B'].map((letter) => ({
      id: letter, organizerUserId: 'admin', name: `大会${letter}`, status: 'draft',
      createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
    })),
    teams: [{ id: 'team1', tournamentId: 'A', name: '新しいチーム', displayOrder: 1, status: 'draft', roster: [] }],
  }
  state.teamsResponse = async (tournamentId) => {
    const teams = structuredClone(state.teams.filter((team) => team.tournamentId === tournamentId))
    if (tournamentId === 'A' && ++requestsForA === 1) {
      teams[0].name = '古いチーム'
      markOldRequested()
      await oldTeamsWait
    }
    return teams
  }
  await mockApi(page, state)
  await connect(page)
  const firstTeamsRequest = page.waitForRequest('http://127.0.0.1:8787/admin/tournaments/A/teams')
  await page.getByRole('button', { name: /大会A/ }).click()
  const delayedRequest = await firstTeamsRequest
  await oldRequested
  await page.getByRole('button', { name: /大会B/ }).click()
  await page.getByRole('button', { name: /大会A/ }).click()
  await page.getByRole('button', { name: /新しいチーム 表示順/ }).click()
  await page.getByLabel('チーム名 必須').fill('チーム・保存済')
  await page.getByRole('button', { name: 'チームを更新' }).click()
  await expect(page.getByText('チームを更新しました。')).toBeVisible()

  await expect(page.getByRole('button', { name: 'チームを更新' })).toBeEnabled()
  const oldResponse = page.waitForResponse((response) => response.request() === delayedRequest)
  releaseOldTeams()
  await (await oldResponse).finished()
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await expect(page.getByRole('button', { name: /チーム・保存済 表示順/ })).toBeVisible()
  await expect(page.getByText('古いチーム', { exact: true })).toHaveCount(0)
})


test('参加者の紐付けで空の登録名を補完し、入力済みの名前を保持して保存する', async ({ page }) => {
  const state: MockState = {
    environment: 'local', failNextPlayerSave: false,
    players: Array.from({ length: 4 }, (_, index) => ({
      id: `p${index + 1}`, displayName: `Player ${index + 1}`, iconUrl: null, position: null, weaponIds: [],
    })),
    tournaments: [{ id: 't1', organizerUserId: 'admin', name: '名前補完テスト大会', status: 'draft', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' }],
    teams: [],
  }
  await mockApi(page, state)
  await connect(page)
  await page.getByRole('button', { name: /名前補完テスト大会/ }).click()
  await page.getByLabel('チーム名 必須').fill('名前補完チーム')

  const registeredNameInput = page.getByLabel('参加者 1 登録名')
  const registeredNameAtLimit = 'あ'.repeat(20)
  await expect(registeredNameInput).toHaveAttribute('maxlength', '20')
  await insertText(page, registeredNameInput, registeredNameAtLimit)
  await expect(registeredNameInput).toHaveValue(registeredNameAtLimit)
  await registeredNameInput.fill('')
  await insertText(page, registeredNameInput, `${registeredNameAtLimit}い`)
  await expect(registeredNameInput).toHaveValue(registeredNameAtLimit)
  await registeredNameInput.fill('')
  await page.getByLabel('参加者 1 紐付け').selectOption('p1')
  await expect(page.getByLabel('参加者 1 登録名')).toHaveValue('Player 1')
  await page.getByLabel('参加者 1 紐付け').selectOption('p2')
  await expect(page.getByLabel('参加者 1 登録名')).toHaveValue('Player 1')

  await page.getByRole('button', { name: '参加枠を追加' }).click()
  await page.getByLabel('参加者 2 登録名').fill('大会用の名前')
  await page.getByLabel('参加者 2 紐付け').selectOption('p1')
  await expect(page.getByLabel('参加者 2 登録名')).toHaveValue('大会用の名前')

  await page.getByRole('button', { name: '参加枠を追加' }).click()
  await page.getByLabel('参加者 3 登録名').fill('   ')
  await page.getByLabel('参加者 3 紐付け').selectOption('p3')
  await expect(page.getByLabel('参加者 3 登録名')).toHaveValue('Player 3')

  await page.getByRole('button', { name: '参加枠を追加' }).click()
  await page.getByLabel('参加者 4 紐付け').selectOption('p4')
  await expect(page.getByLabel('参加者 4 登録名')).toHaveValue('Player 4')
  await page.getByLabel('参加者 4 紐付け').selectOption('')
  await expect(page.getByLabel('参加者 4 登録名')).toHaveValue('Player 4')
  await page.getByLabel('参加者 4 紐付け').selectOption('p4')
  await expect(page.getByLabel('チームの状態')).toHaveValue('confirmed')
  await page.getByRole('button', { name: 'チームを登録' }).click()
  await expect(page.getByText('チームを登録しました。')).toBeVisible()
  expect(state.teams[0].roster.map((entry) => entry.registeredName)).toEqual(['Player 1', '大会用の名前', 'Player 3', 'Player 4'])
  expect(state.teams[0].roster.map((entry) => entry.playerId)).toEqual(['p2', 'p1', 'p3', 'p4'])

  await page.getByRole('button', { name: '切断' }).click()
  await page.getByLabel('管理トークン').fill('secret')
  await page.getByRole('button', { name: '接続する' }).click()
  await page.getByRole('button', { name: /名前補完テスト大会/ }).click()
  await page.getByRole('button', { name: /名前補完チーム.*確定/ }).click()
  await expect(page.getByLabel('参加者 1 登録名')).toHaveValue('Player 1')
  await expect(page.getByLabel('参加者 2 登録名')).toHaveValue('大会用の名前')
  await expect(page.getByLabel('参加者 1 紐付け')).toHaveValue('p2')
})
