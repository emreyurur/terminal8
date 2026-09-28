export function MetricValueFallback({
  compact = false,
  loading,
}: {
  compact?: boolean
  loading: boolean
}) {
  if (!loading) {
    return <span className="text-xs font-medium text-[#718096]">Unavailable</span>
  }

  return (
    <span
      aria-label="Loading metric"
      className={`metric-skeleton ${compact ? 'metric-skeleton--compact' : ''}`}
      role="status"
    >
      <span className="sr-only">Loading metric</span>
    </span>
  )
}
