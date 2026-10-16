// Admin sign-in lockout stored in the master database, so clearing the browser does not reset it.
import { Schema, type Connection } from 'mongoose'

const MAX_FAILURES = 5
const LOCK_MS = 60_000

const LockSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    failures: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
)

function Lock(conn: Connection) {
  return conn.models.LoginLock || conn.model('LoginLock', LockSchema)
}

export async function loginLockStatus(conn: Connection, key: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const row = await Lock(conn).findOne({ key }).lean<{ lockedUntil?: Date | null }>()
  const until = row?.lockedUntil ? new Date(row.lockedUntil).getTime() : 0
  const ms = until - Date.now()
  if (ms <= 0) return { locked: false, retryAfterSeconds: 0 }
  return { locked: true, retryAfterSeconds: Math.ceil(ms / 1000) }
}

export async function recordLoginFailure(
  conn: Connection,
  key: string
): Promise<{ locked: boolean; retryAfterSeconds: number; remaining: number }> {
  const current = await loginLockStatus(conn, key)
  if (current.locked) return { locked: true, retryAfterSeconds: current.retryAfterSeconds, remaining: 0 }

  const row = await Lock(conn).findOne({ key }).lean<{ failures?: number }>()
  const failures = (row?.failures || 0) + 1
  const locked = failures >= MAX_FAILURES
  await Lock(conn).updateOne(
    { key },
    { $set: { failures: locked ? 0 : failures, lockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null } },
    { upsert: true }
  )
  return { locked, retryAfterSeconds: locked ? Math.ceil(LOCK_MS / 1000) : 0, remaining: locked ? 0 : MAX_FAILURES - failures }
}

export async function clearLoginFailures(conn: Connection, key: string): Promise<void> {
  await Lock(conn).deleteOne({ key })
}
