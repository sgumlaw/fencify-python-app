// src/api.ts
export type ProcessPrompt =
  | { type: 'highlight'; target: 'fence' | 'walls' | string; color?: string }
  | { type: 'scale'; factor: number; target?: string }
  | { type: 'isolate'; target: string }

const API = import.meta.env.VITE_API_BASE ?? ''

export async function uploadBlueprint(file: File) {
  const fd = new FormData()
  fd.append('blueprint', file)
  const res = await fetch(`${API}/api/blueprints/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ id: string; url: string; message: string }>
}

export async function processBlueprint(blueprintId: string, prompt: ProcessPrompt) {
  const res = await fetch(`${API}/api/blueprints/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blueprintId, prompt }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ url: string | null; message: string }>
}
