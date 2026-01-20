import type { LucideIcon } from 'lucide-react'
import { getIcon } from '@/lib/icons'

export type Page = {
  path: string
  title: string
  icon: string
  Icon: LucideIcon | undefined
}

type RouteWithStaticData = {
  fullPath: string
  options?: { staticData?: { title: string; icon: string } }
}

export function buildPages(routeTreeChildren: object | undefined): Page[] {
  if (!routeTreeChildren) return []

  return Object.values(routeTreeChildren as Record<string, RouteWithStaticData>)
    .map((route) => {
      const staticData = route.options?.staticData
      if (!staticData) return null
      return {
        path: route.fullPath,
        title: staticData.title,
        icon: staticData.icon,
        Icon: getIcon(staticData.icon),
      }
    })
    .filter((page): page is Page => page !== null)
}
