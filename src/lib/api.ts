import 'server-only'
import { currentUser } from '@/lib/session'
import type { SessionUser } from '@/lib/session'

/** Route helper: 401 JSON when signed out, otherwise runs the handler with the user. */
export async function withUser(f: (u: SessionUser) => Promise<Response>): Promise<Response> {
  const u = await currentUser()
  if (!u) return Response.json({ error: 'signed_out' }, { status: 401 })
  try { return await f(u) } catch (e) {
    console.error(e)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}
