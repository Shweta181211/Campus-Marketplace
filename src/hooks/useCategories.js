import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { api } from '../api'
import { categories as builtIn } from '../data/mockData'

let cache = null

/** Categories configured by admins (disabled ones are hidden). Custom categories get a generic icon. */
export function useCategories() {
  const [list, setList] = useState(cache || builtIn)
  useEffect(() => {
    let alive = true
    api
      .getCategories()
      .then((rows) => {
        const merged = rows.map((r) => {
          const known = builtIn.find((c) => c.id === r.id)
          return { ...(known || { icon: Package }), ...r, icon: known?.icon || Package }
        })
        cache = merged
        if (alive) setList(merged)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return list
}
