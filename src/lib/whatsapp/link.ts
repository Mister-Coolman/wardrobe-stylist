import { randomInt } from 'node:crypto'
import type { Profile } from '@/lib/domain/types'

export const LINK_MINUTES = 10

/** A 6-digit code the owner texts to the stylist's WhatsApp number; the app never asks for a phone number. */
export function newLinkCode(now = new Date()): { code: string; expires: string } {
  return { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expires: new Date(now.getTime() + LINK_MINUTES * 60_000).toISOString() }
}

/** The profile waiting for exactly this code (the whole message, trimmed), if it hasn't expired. */
export function matchLinkCode(profiles: Profile[], text: string, now = new Date()): Profile | null {
  const code = text.trim()
  if (!/^\d{6}$/.test(code)) return null
  return profiles.find((p) => p.whatsappLinkCode === code && !!p.whatsappLinkExpires && new Date(p.whatsappLinkExpires) > now) ?? null
}
