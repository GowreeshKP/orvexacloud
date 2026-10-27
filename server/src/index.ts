// --- Orvexa Tech Local Dev Server ---
// This file is only used when running locally (npm run dev in server/).
// Vercel uses api/index.ts at the repo root instead.

import dotenv from 'dotenv'
dotenv.config()

const { connectMasterDatabase } = await import('./config/db.js')
const { app } = await import('./app.js')
const mongoose = (await import('mongoose')).default

const PORT = process.env.PORT || 5000

async function startServer() {
  try {
    try {
      await connectMasterDatabase()
      console.log('🚀 Connected to Master Database (orvexatech_master)')
    } catch (dbErr) {
      console.warn('⚠️ Master MongoDB connection deferred or offline. Starting Express server...')
    }

    const server = app.listen(PORT, () => {
      console.log(`🌐 Orvexa Tech Backend running on http://localhost:${PORT}`)
      console.log(`📡 Health Check:   http://localhost:${PORT}/api/health`)
      console.log(`🛡️ Admin APIs:     http://localhost:${PORT}/api/admin/*`)
      console.log(`🏬 Store APIs:     http://localhost:${PORT}/api/stores/:tenantSlug/*`)
    })

    const shutdown = (signal: string) => {
      console.log(`${signal} received, closing server...`)
      server.close(async () => {
        await mongoose.disconnect().catch(() => undefined)
        process.exit(0)
      })
      setTimeout(() => process.exit(1), 10_000).unref()
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    console.error('Fatal Server Error:', error)
    process.exit(1)
  }
}

startServer()
