// Asks the Vite dev server to create src/tenants/<slug>/ from the template (dev only).
// In production the folder is created with `npm run store:create -- <slug>` before a deploy.

export async function createStoreFolder(slug: string, brandName: string): Promise<string | null> {
  if (!import.meta.env.DEV) return null
  try {
    const res = await fetch('/__orvexa/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, brandName }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.warn(`[stores] Could not create the frontend folder for "${slug}":`, data.error)
      return null
    }
    return data.folder as string
  } catch {
    return null
  }
}
