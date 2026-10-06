import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_ORDER, defaultOpeningHours, getCategoryConfig } from '@shared/categories'
import { buildTermForms, resolveTerminology } from '@shared/terminology'

describe('configuration par catégorie', () => {
  it('chaque catégorie est complète et cohérente', () => {
    expect(CATEGORY_ORDER).toHaveLength(Object.keys(CATEGORIES).length)
    for (const id of CATEGORY_ORDER) {
      const c = CATEGORIES[id]
      expect(c.id).toBe(id)
      expect(c.label).toBeTruthy()
      expect(c.client.singular && c.client.plural).toBeTruthy()
      expect(c.staff.singular && c.staff.plural).toBeTruthy()
      expect(c.defaultServices.length).toBeGreaterThan(0)
      expect(c.kpis.length).toBe(4)
      expect(c.defaultAppointmentDurationMin).toBeGreaterThan(0)
      // Pas d'information affichée deux fois sur le tableau de bord.
      if (c.kpis.includes('outstanding')) expect(c.panels).not.toContain('outstanding')
      expect(new Set(c.kpis).size).toBe(c.kpis.length)
      for (const s of c.defaultServices) {
        expect(s.durationMin).toBeGreaterThanOrEqual(5)
        expect(s.price).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('les cabinets médicaux parlent de patients, les barbiers de clients', () => {
    expect(getCategoryConfig('dentist').client.plural).toBe('Patients')
    expect(getCategoryConfig('dentist').service.plural).toBe('Soins')
    expect(getCategoryConfig('doctor').staffNavLabel).toBe('Médecins')
    expect(getCategoryConfig('barber').staff.plural).toBe('Barbiers')
    expect(getCategoryConfig('barber').features.walkIn).toBe(true)
    expect(getCategoryConfig('dentist').features.clientInsurance).toBe(true)
    expect(getCategoryConfig('hair_salon').service.plural).toBe('Prestations')
  })

  it('catégorie inconnue → « Autre »', () => {
    expect(getCategoryConfig('inconnu').id).toBe('other')
    expect(getCategoryConfig(null).id).toBe('other')
  })

  it('horaires par défaut : dimanche fermé, pause déjeuner pour les cabinets', () => {
    const dentist = defaultOpeningHours('dentist')
    expect(dentist).toHaveLength(7)
    expect(dentist[6].open).toBe(false)
    expect(dentist[0].breaks).toEqual([{ start: 780, end: 840 }])
    expect(defaultOpeningHours('barber')[0].breaks).toEqual([])
  })
})

describe('terminologie et accords', () => {
  it('accorde au masculin, féminin et avec élision', () => {
    const patient = buildTermForms({ singular: 'Patient', plural: 'Patients', feminine: false })
    expect(patient.newLabel).toBe('Nouveau patient')
    expect(patient.none).toBe('Aucun patient')
    expect(patient.a).toBe('un patient')

    const cliente = buildTermForms({ singular: 'Cliente', plural: 'Clientes', feminine: true })
    expect(cliente.newLabel).toBe('Nouvelle cliente')
    expect(cliente.first).toBe('première')

    const esth = buildTermForms({ singular: 'Esthéticienne', plural: 'Esthéticiennes', feminine: true })
    expect(esth.the).toBe("l'esthéticienne")

    const acte = buildTermForms({ singular: 'Acte', plural: 'Actes', feminine: false })
    expect(acte.newLabel).toBe('Nouvel acte')
  })

  it('applique les personnalisations du propriétaire', () => {
    const t = resolveTerminology('barber', { clientSingular: 'Habitué', clientPlural: 'Habitués', staffPlural: 'Coiffeurs' })
    expect(t.client.plural).toBe('Habitués')
    expect(t.staffNavLabel).toBe('Coiffeurs')
    expect(t.service.plural).toBe('Services')
  })
})
