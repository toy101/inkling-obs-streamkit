export type AdminTarget = 'local' | 'production'

export interface TargetConfig {
  id: AdminTarget
  label: string
  apiUrl: string
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function readApiUrl(value: unknown, fallback: string, name: string): string {
  const candidate = typeof value === 'string' && value.trim() !== '' ? value : fallback
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`${name} は有効な URL ではありません。`)
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error(`${name} は HTTPS、またはループバック HTTP の URL を指定してください。`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} に認証情報、クエリ、フラグメントを含めないでください。`)
  }

  return url.href.replace(/\/$/, '')
}

export const targetConfigs: Record<AdminTarget, TargetConfig> = {
  local: {
    id: 'local',
    label: 'ローカル D1',
    apiUrl: readApiUrl(
      import.meta.env.VITE_LOCAL_API_URL,
      'http://127.0.0.1:8787',
      'VITE_LOCAL_API_URL',
    ),
  },
  production: {
    id: 'production',
    label: '本番環境 D1',
    apiUrl: readApiUrl(
      import.meta.env.VITE_PRODUCTION_API_URL,
      'http://127.0.0.1:3000',
      'VITE_PRODUCTION_API_URL',
    ),
  },
}

export function readInitialTarget(value: unknown): AdminTarget {
  return value === 'production' ? 'production' : 'local'
}
