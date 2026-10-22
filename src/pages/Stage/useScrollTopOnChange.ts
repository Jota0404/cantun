import { useEffect, useRef } from 'react'

/** Volta ao topo quando a chave muda; ignora o primeiro valor (mount/reconexão na mesma música). */
export function useScrollTopOnChange(key: number | undefined) {
  const previous = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (key !== undefined && previous.current !== undefined && previous.current !== key) window.scrollTo({ top: 0 })
    if (key !== undefined) previous.current = key
  }, [key])
}
