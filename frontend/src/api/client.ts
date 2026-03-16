const BASE = '/api'
const API_KEY = 'olivera2026'

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options?.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
