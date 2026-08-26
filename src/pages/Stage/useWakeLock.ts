import { useEffect, useRef } from 'react'

interface WakeLockSentinelLike extends EventTarget {
  release(): Promise<void>
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: WakeLockLike
}

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)
  const requestInFlightRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function requestWakeLock() {
      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock

      if (!wakeLock || cancelled || requestInFlightRef.current || sentinelRef.current) {
        return
      }

      requestInFlightRef.current = true

      try {
        const sentinel = await wakeLock.request('screen')

        if (cancelled) {
          await sentinel.release().catch(() => undefined)
          return
        }

        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
          }
        })
      } catch {
        // Wake Lock is optional and must never block Stage Mode.
      } finally {
        requestInFlightRef.current = false
      }
    }

    void requestWakeLock()

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      const sentinel = sentinelRef.current
      sentinelRef.current = null

      if (sentinel) {
        void sentinel.release().catch(() => undefined)
      }
    }
  }, [])
}
