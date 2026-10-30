import { ScanFlow } from '@/components/scan/ScanFlow'

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams
  return <ScanFlow initialMode={mode === 'web' ? 'web' : undefined} />
}
