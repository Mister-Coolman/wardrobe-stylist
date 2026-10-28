import { SettingsView } from '@/components/settings/SettingsView'
import { getRepo } from '@/lib/db/repo'
import { profileFor } from '@/lib/profile'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const u = await requireUser()
  return <SettingsView profile={await profileFor(await getRepo(), u.userId)} email={u.email} />
}
