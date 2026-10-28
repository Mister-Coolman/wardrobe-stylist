import type { Profile } from '@/lib/domain/types'
import { DEFAULT_WEAR_LIMITS } from '@/lib/domain/wearLimits'
import type { Repo } from '@/lib/db/repo'

/** Used until onboarding saves a real profile. */
export function defaultProfile(userId: string): Profile {
  return {
    userId, homeCity: 'New York', homeLat: 40.71, homeLon: -74.01, tz: 'America/New_York',
    personPhotoUrl: null, renderMode: 'flatlay', wearLimits: DEFAULT_WEAR_LIMITS, styleProfile: null,
  }
}

export async function profileFor(repo: Repo, userId: string): Promise<Profile> {
  const p = await repo.getProfile(userId)
  return p ? { ...p, wearLimits: { ...DEFAULT_WEAR_LIMITS, ...p.wearLimits } } : defaultProfile(userId)
}
