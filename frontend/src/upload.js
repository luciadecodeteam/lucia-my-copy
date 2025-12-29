export async function putToSignedUrl({ url, headers, blob }) {
  const res = await fetch(url, { method: 'PUT', headers, body: blob })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PUT failed: ${res.status} ${text}`)
  }
  return { ok: true }
}
