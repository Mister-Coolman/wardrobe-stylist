import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { profileFor } from '@/lib/profile'
import { newLinkCode } from '@/lib/whatsapp/link'

/** A fresh link code and the number to text it to */
export async function POST() {
  return withUser(async (u) => {
    const repo = await getRepo()
    const { code, expires } = newLinkCode()
    await repo.upsertProfile({ ...(await profileFor(repo, u.userId)), whatsappLinkCode: code, whatsappLinkExpires: expires })
    return Response.json({ code, expires, number: process.env.WHATSAPP_DISPLAY_NUMBER || null })
  })
}

export async function DELETE() {
  return withUser(async (u) => {
    const repo = await getRepo()
    await repo.upsertProfile({ ...(await profileFor(repo, u.userId)), whatsappId: null, whatsappLinkCode: null, whatsappLinkExpires: null })
    return Response.json({ ok: true })
  })
}
