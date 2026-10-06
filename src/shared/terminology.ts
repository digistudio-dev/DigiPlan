// Résolution de la terminologie (catégorie + personnalisations) et accords grammaticaux français.

import { getCategoryConfig, type Term } from './categories'
import type { CategoryId, TerminologyOverrides } from './types'

export interface TermForms {
  singular: string
  plural: string
  feminine: boolean
  /** « client », « patiente »… (minuscule) */
  lower: string
  lowerPlural: string
  /** « un client » / « une cliente » */
  a: string
  /** « le client » / « l'esthéticienne » */
  the: string
  /** « Nouveau client » / « Nouvelle cliente » */
  newLabel: string
  /** « Aucun client » / « Aucune cliente » */
  none: string
  /** « premier » / « première » */
  first: string
}

export interface Terminology {
  client: TermForms
  staff: TermForms
  service: TermForms
  resource: TermForms
  staffNavLabel: string
}

const VOWEL_START = /^[aeiouyhâàäéèêëîïôöûùü]/i

function lowerFirst(value: string): string {
  // Ne met en minuscule que le premier mot pour préserver « Membre de l'équipe ».
  return value.charAt(0).toLowerCase() + value.slice(1)
}

export function buildTermForms(term: Term): TermForms {
  const lower = lowerFirst(term.singular)
  const lowerPlural = lowerFirst(term.plural)
  const elide = VOWEL_START.test(lower)
  return {
    singular: term.singular,
    plural: term.plural,
    feminine: term.feminine,
    lower,
    lowerPlural,
    a: `${term.feminine ? 'une' : 'un'} ${lower}`,
    the: elide ? `l'${lower}` : `${term.feminine ? 'la' : 'le'} ${lower}`,
    newLabel: `${term.feminine ? 'Nouvelle' : elide ? 'Nouvel' : 'Nouveau'} ${lower}`,
    none: `${term.feminine ? 'Aucune' : 'Aucun'} ${lower}`,
    first: term.feminine ? 'première' : 'premier'
  }
}

function pick(base: Term, singular?: string, plural?: string, feminine?: boolean): Term {
  return {
    singular: singular?.trim() || base.singular,
    plural: plural?.trim() || base.plural,
    feminine: feminine ?? base.feminine
  }
}

export function resolveTerminology(categoryId: CategoryId, overrides: TerminologyOverrides = {}): Terminology {
  const config = getCategoryConfig(categoryId)
  const staff = pick(config.staff, overrides.staffSingular, overrides.staffPlural, overrides.staffFeminine)
  const staffCustomized = Boolean(overrides.staffPlural?.trim())
  return {
    client: buildTermForms(pick(config.client, overrides.clientSingular, overrides.clientPlural, overrides.clientFeminine)),
    staff: buildTermForms(staff),
    service: buildTermForms(
      pick(config.service, overrides.serviceSingular, overrides.servicePlural, overrides.serviceFeminine)
    ),
    resource: buildTermForms(config.resource),
    staffNavLabel: staffCustomized ? staff.plural : config.staffNavLabel
  }
}
