import { describe, expect, test } from 'vitest'
import { matchLinkCode, newLinkCode } from '@/lib/whatsapp/link'
import { defaultProfile } from '@/lib/profile'

const now = new Date('2026-10-30T12:00:00Z')
const pending = { ...defaultProfile('u1'), whatsappLinkCode: '123456', whatsappLinkExpires: '2026-10-30T12:05:00Z' }
const other = { ...defaultProfile('u2'), whatsappLinkCode: '654321', whatsappLinkExpires: '2026-10-30T11:59:00Z' }

describe('link codes', () => {
  test('the right code within 10 minutes matches its profile', () => {
    expect(matchLinkCode([other, pending], ' 123456 ', now)?.userId).toBe('u1')
  })
  test('a wrong code, an expired code, or a code inside other text does not match', () => {
    expect(matchLinkCode([pending], '123457', now)).toBeNull()
    expect(matchLinkCode([other], '654321', now)).toBeNull()
    expect(matchLinkCode([pending], 'my code is 123456', now)).toBeNull()
  })
  test('new codes are 6 digits and expire in 10 minutes', () => {
    const c = newLinkCode(now)
    expect(c.code).toMatch(/^\d{6}$/)
    expect(new Date(c.expires).getTime() - now.getTime()).toBe(10 * 60_000)
  })
})
