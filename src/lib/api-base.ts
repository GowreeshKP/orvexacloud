// Single place the frontend learns the API origin.
// VITE_API_URL is the host (https://orvexa-api-nskw.onrender.com).
// VITE_API_BASE_URL is the /api prefix. Either is enough; both stay compatible.

const origin = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export const API_ORIGIN = origin

export const API_BASE =
  String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') ||
  (origin ? `${origin}/api` : '/api')
