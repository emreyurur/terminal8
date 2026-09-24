import { describe, expect, it } from 'vitest'
import { buildAppPath, getRouteMetadata, parseAppRoute } from './appRoutes'

describe('app routes', () => {
  it('maps top-level paths to application pages', () => {
    expect(parseAppRoute('/')).toEqual({ page: 'landing' })
    expect(parseAppRoute('/app')).toEqual({ page: 'home' })
    expect(parseAppRoute('/docs/')).toEqual({ page: 'docs' })
    expect(parseAppRoute('/tester')).toEqual({ page: 'tester' })
  })

  it('maps pool and position detail paths', () => {
    expect(parseAppRoute('/pools/pool%2Fone')).toEqual({ page: 'home', poolId: 'pool/one', detailTab: 'overview' })
    expect(parseAppRoute('/positions/abc')).toEqual({ page: 'home', poolId: 'abc', detailTab: 'position' })
  })

  it('builds canonical paths for every screen', () => {
    expect(buildAppPath({ page: 'landing' })).toBe('/')
    expect(buildAppPath({ page: 'home' })).toBe('/app')
    expect(buildAppPath({ page: 'docs' })).toBe('/docs')
    expect(buildAppPath({ page: 'tester' })).toBe('/tester')
    expect(buildAppPath({ page: 'home', poolId: 'a/b', detailTab: 'position' })).toBe('/positions/a%2Fb')
  })

  it('provides distinct SEO metadata for route types', () => {
    expect(getRouteMetadata({ page: 'docs' }).title).toContain('Documentation')
    expect(getRouteMetadata({ page: 'home', poolId: 'abc', detailTab: 'position' }).title).toContain('Manage Position')
  })
})
