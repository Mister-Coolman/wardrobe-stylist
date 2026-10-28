/** Server key: the new `sb_secret_…` key, or the legacy service-role JWT. */
export function supabaseServerKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!process.env.SUPABASE_URL || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY')
  return key
}
