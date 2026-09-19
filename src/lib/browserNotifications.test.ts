import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificationPermission, showBrowserNotification } from './browserNotifications'

afterEach(() => vi.unstubAllGlobals())

describe('browser notifications', () => {
  it('reports unsupported when the API is missing', () => {
    vi.stubGlobal('Notification', undefined)
    expect(notificationPermission()).toBe('unsupported')
    expect(showBrowserNotification('t', 'b', 'tag')).toBe(false)
  })

  it('does not show anything unless permission is granted', () => {
    const ctor = vi.fn()
    vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'default' }))
    expect(showBrowserNotification('t', 'b', 'tag')).toBe(false)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('shows a notification with a tag so repeats are collapsed', () => {
    const instances: { title: string; opts: unknown }[] = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor(title: string, opts: unknown) {
        instances.push({ title, opts })
      }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)
    expect(showBrowserNotification('Terminal8 alert', 'price rose', 'alert-7')).toBe(true)
    expect(instances).toEqual([{ title: 'Terminal8 alert', opts: { body: 'price rose', tag: 'alert-7' } }])
  })
})
