// --- Vercel Serverless Handler ---
// Vercel invokes this file for all /api/* requests.
// It imports the pre-configured Express app and exports it as the handler.
// The app singleton is re-used across warm invocations (connection pooling works).

import 'dotenv/config'
import { connectMasterDatabase } from '../server/src/config/db.js'
import { app } from '../server/src/app.js'

// Eagerly connect to MongoDB on cold start.
// On warm invocations the cached connection is returned immediately.
connectMasterDatabase().catch((err) => {
  console.error('[Vercel] Master DB connection failed on cold start:', err.message)
})

export default app
