export type PermissionState = NotificationPermission | 'unsupported'

export function notificationPermission(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

/** Raises a system notification. Returns false when it cannot (unsupported or not allowed). */
export function showBrowserNotification(title: string, body: string, tag: string, onClick?: () => void): boolean {
  if (notificationPermission() !== 'granted') return false
  try {
    const n = new Notification(title, { body, tag })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
    return true
  } catch {
    return false
  }
}
