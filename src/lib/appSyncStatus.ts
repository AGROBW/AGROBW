import { useEffect, useState } from 'react'

type Listener = (count: number) => void

let activeSyncCount = 0
const listeners = new Set<Listener>()

const emit = () => {
  listeners.forEach((listener) => listener(activeSyncCount))
}

export const startAppSync = () => {
  activeSyncCount += 1
  emit()
}

export const endAppSync = () => {
  activeSyncCount = Math.max(0, activeSyncCount - 1)
  emit()
}

export const subscribeToAppSync = (listener: Listener) => {
  listeners.add(listener)
  listener(activeSyncCount)

  return () => {
    listeners.delete(listener)
  }
}

export const useAppSyncStatus = () => {
  const [count, setCount] = useState(activeSyncCount)

  useEffect(() => subscribeToAppSync(setCount), [])

  return {
    isSyncing: count > 0,
    activeSyncCount: count
  }
}
