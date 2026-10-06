// Contexte applicatif : établissement, catégorie, terminologie, édition.

import { useMemo } from 'react'
import { getCategoryConfig } from '@shared/categories'
import { resolveTerminology } from '@shared/terminology'
import { hasFeature, type ProFeature } from '@shared/edition'
import { useBootstrap } from '@/lib/queries'
import { useUi } from '@/stores/ui'

export function useApp() {
  const { data } = useBootstrap()
  const business = data?.business ?? null
  const settings = data!.settings
  const license = data!.license
  const categoryId = business?.categoryId ?? 'other'
  return useMemo(() => {
    const category = getCategoryConfig(categoryId)
    const terms = resolveTerminology(categoryId, business?.terminology ?? {})
    const isPro = license.edition === 'pro'
    return { business, settings, license, category, terms, isPro, hours: data!.hours, currency: business?.currency ?? 'MAD' }
  }, [business, settings, license, categoryId, data])
}

/** Renvoie une fonction qui exécute l'action si la fonctionnalité Pro est disponible, sinon ouvre l'offre Pro. */
export function useProGate() {
  const { license } = useApp()
  const openUpgrade = useUi((s) => s.openUpgrade)
  return (feature: ProFeature, action?: () => void): boolean => {
    if (hasFeature(license.edition, feature)) {
      action?.()
      return true
    }
    openUpgrade(feature)
    return false
  }
}
