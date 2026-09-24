export type AppPage = 'landing' | 'home' | 'docs' | 'tester'

export type AppRoute = {
  page: AppPage
  poolId?: string
  detailTab?: 'overview' | 'position'
}

const PAGE_PATHS: Record<AppPage, string> = {
  landing: '/',
  home: '/app',
  docs: '/docs',
  tester: '/tester',
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseAppRoute(pathname: string): AppRoute {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length === 0) return { page: 'landing' }
  if (segments.length === 1 && (segments[0] === 'app' || segments[0] === 'home')) return { page: 'home' }
  if (segments.length === 1 && segments[0] === 'docs') return { page: 'docs' }
  if (segments.length === 1 && segments[0] === 'tester') return { page: 'tester' }
  if (segments.length === 2 && segments[0] === 'pools' && segments[1]) {
    return { page: 'home', poolId: decodePathSegment(segments[1]), detailTab: 'overview' }
  }
  if (segments.length === 2 && segments[0] === 'positions' && segments[1]) {
    return { page: 'home', poolId: decodePathSegment(segments[1]), detailTab: 'position' }
  }

  return { page: 'landing' }
}

export function buildAppPath(route: AppRoute): string {
  if (route.page === 'home' && route.poolId) {
    const prefix = route.detailTab === 'position' ? '/positions' : '/pools'
    return `${prefix}/${encodeURIComponent(route.poolId)}`
  }
  return PAGE_PATHS[route.page]
}

export function getRouteMetadata(route: AppRoute): { title: string; description: string } {
  if (route.page === 'docs') {
    return {
      title: 'Documentation | Terminal8',
      description: 'Learn how to discover Stellar liquidity pools, deposit assets, manage positions, and use Terminal8.',
    }
  }
  if (route.page === 'tester') {
    return {
      title: 'API Tester | Terminal8',
      description: 'Inspect Terminal8 Stellar API requests and responses.',
    }
  }
  if (route.page === 'home' && route.poolId && route.detailTab === 'position') {
    return {
      title: 'Manage Position | Terminal8',
      description: 'Review performance, deposit liquidity, or withdraw from your Stellar position.',
    }
  }
  if (route.page === 'home' && route.poolId) {
    return {
      title: 'Pool Details | Terminal8',
      description: 'Review pool performance, risk, liquidity, and deposit options on Stellar.',
    }
  }
  if (route.page === 'home') {
    return {
      title: 'Stellar DeFi App | Terminal8',
      description: 'Discover Stellar liquidity pools and manage your DeFi positions from one interface.',
    }
  }
  return {
    title: 'Terminal8 | Stellar DeFi',
    description: 'Discover, evaluate, and manage Stellar DeFi opportunities with Terminal8.',
  }
}
