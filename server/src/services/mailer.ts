// --- Transactional Email (Resend) ---
// Sends through Resend when RESEND_API_KEY and MAIL_FROM are set; otherwise logs that the
// email was skipped so local development works without a provider.

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  /** Resend keeps each key for 24 hours, so a repeated call with the same key never sends twice. */
  idempotencyKey?: string
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  return `${(user || '').slice(0, 2)}***@${domain || ''}`
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
}

export async function sendEmail({ to, subject, text, idempotencyKey }: OutgoingEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!apiKey || !from) {
    // Bodies can hold single-use password links, so they are only printed outside production.
    const body = process.env.NODE_ENV === 'production' ? '' : `\n${text}`
    console.log(`[Mail] Not sent (RESEND_API_KEY / MAIL_FROM unset): "${subject}" to ${maskEmail(to)}${body}`)
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      // 403 usually means MAIL_FROM is not on the domain verified in Resend; 401 a wrong or deleted key.
      console.error(`[Mail] Resend refused "${subject}" to ${maskEmail(to)}: HTTP ${res.status}`)
      return false
    }
    return true
  } catch (err: any) {
    console.error(`[Mail] Failed to send "${subject}" to ${maskEmail(to)}:`, err.message)
    return false
  }
}
