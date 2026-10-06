// Moteur de configuration par catégorie d'activité.
// Toute l'interface consomme cette configuration : ajouter une nouvelle activité = ajouter une entrée ici.

import type { CategoryId, DaySchedule } from './types'

export interface Term {
  singular: string
  plural: string
  /** Genre grammatical, utilisé pour accorder « un/une », « nouveau/nouvelle »… */
  feminine: boolean
}

export type KpiWidgetId =
  | 'todayCount'
  | 'todayRevenue'
  | 'completed'
  | 'upcoming'
  | 'cancellations'
  | 'noShowRate'
  | 'outstanding'
  | 'waiting'
  | 'weekRevenue'
  | 'newClients'

export type PanelWidgetId = 'topService' | 'topStaff' | 'revenueTrend' | 'outstanding'

export interface DefaultService {
  name: string
  category: string
  durationMin: number
  /** Prix indicatif en dirhams. */
  price: number
}

export interface CategoryFeatures {
  /** Bouton « Client sans rendez-vous » (passage direct). */
  walkIn: boolean
  /** Gestion des ressources recommandée (fauteuils, cabinets, salles…). */
  resources: boolean
  /** Commissions des membres de l'équipe pertinentes. */
  commissions: boolean
  /** Salle d'attente : suivi des personnes arrivées. */
  waitingRoom: boolean
  clientBirthDate: boolean
  clientGender: boolean
  clientInsurance: boolean
}

export interface BusinessCategoryConfig {
  id: CategoryId
  label: string
  description: string
  /** Nom d'icône lucide-react. */
  icon: string
  client: Term
  staff: Term
  /** Libellé de la section équipe dans la navigation. */
  staffNavLabel: string
  service: Term
  resource: Term
  /** Rôle proposé par défaut pour le premier membre de l'équipe. */
  defaultStaffRole: string
  defaultServices: DefaultService[]
  suggestedResources: string[]
  defaultAppointmentDurationMin: number
  slotStepMin: number
  kpis: KpiWidgetId[]
  panels: PanelWidgetId[]
  features: CategoryFeatures
  /** Étiquettes clients suggérées. */
  suggestedTags: string[]
  /** Catégories de dépenses suggérées. */
  expenseCategories: string[]
}

const COMMON_EXPENSES = ['Loyer', 'Salaires', 'Électricité & eau', 'Internet & téléphone', 'Fournitures', 'Marketing', 'Divers']

const t = (singular: string, plural: string, feminine = false): Term => ({ singular, plural, feminine })

export const CATEGORIES: Record<CategoryId, BusinessCategoryConfig> = {
  barber: {
    id: 'barber',
    label: 'Barbier',
    description: 'Coupes, barbe, rasage',
    icon: 'Scissors',
    client: t('Client', 'Clients'),
    staff: t('Barbier', 'Barbiers'),
    staffNavLabel: 'Barbiers',
    service: t('Service', 'Services'),
    resource: t('Fauteuil', 'Fauteuils'),
    defaultStaffRole: 'Barbier',
    defaultServices: [
      { name: 'Coupe homme', category: 'Coupes', durationMin: 30, price: 50 },
      { name: 'Barbe', category: 'Barbe', durationMin: 20, price: 30 },
      { name: 'Coupe + barbe', category: 'Coupes', durationMin: 45, price: 80 },
      { name: 'Coupe enfant', category: 'Coupes', durationMin: 20, price: 40 },
      { name: 'Rasage traditionnel', category: 'Barbe', durationMin: 30, price: 50 },
      { name: 'Soin du visage', category: 'Soins', durationMin: 30, price: 80 }
    ],
    suggestedResources: ['Fauteuil 1', 'Fauteuil 2'],
    defaultAppointmentDurationMin: 30,
    slotStepMin: 15,
    kpis: ['todayCount', 'todayRevenue', 'completed', 'noShowRate'],
    panels: ['topStaff', 'topService', 'revenueTrend'],
    features: {
      walkIn: true,
      resources: true,
      commissions: true,
      waitingRoom: true,
      clientBirthDate: false,
      clientGender: false,
      clientInsurance: false
    },
    suggestedTags: ['Fidèle', 'VIP', 'Enfant'],
    expenseCategories: ['Produits', ...COMMON_EXPENSES]
  },
  hair_salon: {
    id: 'hair_salon',
    label: 'Salon de coiffure',
    description: 'Coupe, coloration, coiffage',
    icon: 'Wind',
    client: t('Client', 'Clients'),
    staff: t('Coiffeur', 'Coiffeurs'),
    staffNavLabel: 'Équipe',
    service: t('Prestation', 'Prestations', true),
    resource: t('Poste', 'Postes'),
    defaultStaffRole: 'Coiffeur',
    defaultServices: [
      { name: 'Coupe', category: 'Coiffure', durationMin: 45, price: 150 },
      { name: 'Brushing', category: 'Coiffure', durationMin: 30, price: 100 },
      { name: 'Coloration', category: 'Couleur', durationMin: 90, price: 350 },
      { name: 'Mèches', category: 'Couleur', durationMin: 120, price: 500 },
      { name: 'Soin capillaire', category: 'Soins', durationMin: 30, price: 150 },
      { name: 'Coiffure de soirée', category: 'Coiffure', durationMin: 60, price: 300 },
      { name: 'Lissage', category: 'Soins', durationMin: 150, price: 800 }
    ],
    suggestedResources: ['Poste 1', 'Poste 2', 'Bac à shampoing'],
    defaultAppointmentDurationMin: 45,
    slotStepMin: 15,
    kpis: ['todayCount', 'todayRevenue', 'waiting', 'upcoming'],
    panels: ['topService', 'topStaff', 'revenueTrend'],
    features: {
      walkIn: true,
      resources: true,
      commissions: true,
      waitingRoom: true,
      clientBirthDate: true,
      clientGender: true,
      clientInsurance: false
    },
    suggestedTags: ['Fidèle', 'VIP', 'Mariée', 'Allergie produit'],
    expenseCategories: ['Produits', ...COMMON_EXPENSES]
  },
  beauty_salon: {
    id: 'beauty_salon',
    label: 'Salon de beauté',
    description: 'Esthétique, ongles, soins',
    icon: 'Sparkles',
    client: t('Cliente', 'Clientes', true),
    staff: t('Esthéticienne', 'Esthéticiennes', true),
    staffNavLabel: 'Équipe',
    service: t('Prestation', 'Prestations', true),
    resource: t('Cabine', 'Cabines', true),
    defaultStaffRole: 'Esthéticienne',
    defaultServices: [
      { name: 'Manucure', category: 'Ongles', durationMin: 45, price: 120 },
      { name: 'Pédicure', category: 'Ongles', durationMin: 60, price: 150 },
      { name: 'Vernis semi-permanent', category: 'Ongles', durationMin: 60, price: 200 },
      { name: 'Épilation sourcils', category: 'Épilation', durationMin: 15, price: 40 },
      { name: 'Épilation jambes complètes', category: 'Épilation', durationMin: 45, price: 150 },
      { name: 'Soin du visage', category: 'Soins', durationMin: 60, price: 300 },
      { name: 'Maquillage', category: 'Maquillage', durationMin: 60, price: 350 },
      { name: 'Extension de cils', category: 'Regard', durationMin: 90, price: 400 }
    ],
    suggestedResources: ['Cabine 1', 'Cabine 2', 'Table manucure'],
    defaultAppointmentDurationMin: 45,
    slotStepMin: 15,
    kpis: ['todayCount', 'todayRevenue', 'waiting', 'upcoming'],
    panels: ['topService', 'topStaff', 'revenueTrend'],
    features: {
      walkIn: true,
      resources: true,
      commissions: true,
      waitingRoom: true,
      clientBirthDate: true,
      clientGender: false,
      clientInsurance: false
    },
    suggestedTags: ['Fidèle', 'VIP', 'Peau sensible', 'Mariée'],
    expenseCategories: ['Produits', ...COMMON_EXPENSES]
  },
  dentist: {
    id: 'dentist',
    label: 'Dentiste',
    description: 'Cabinet dentaire',
    icon: 'Smile',
    client: t('Patient', 'Patients'),
    staff: t('Dentiste', 'Dentistes'),
    staffNavLabel: 'Dentistes',
    service: t('Soin', 'Soins'),
    resource: t('Fauteuil', 'Fauteuils'),
    defaultStaffRole: 'Chirurgien-dentiste',
    defaultServices: [
      { name: 'Consultation', category: 'Consultations', durationMin: 30, price: 300 },
      { name: 'Contrôle', category: 'Consultations', durationMin: 20, price: 200 },
      { name: 'Détartrage', category: 'Soins courants', durationMin: 45, price: 500 },
      { name: 'Soin de carie', category: 'Soins courants', durationMin: 45, price: 600 },
      { name: 'Extraction', category: 'Chirurgie', durationMin: 45, price: 600 },
      { name: 'Blanchiment', category: 'Esthétique', durationMin: 60, price: 2500 }
    ],
    suggestedResources: ['Fauteuil dentaire 1', 'Fauteuil dentaire 2', 'Salle de radiologie'],
    defaultAppointmentDurationMin: 30,
    slotStepMin: 15,
    kpis: ['todayCount', 'upcoming', 'cancellations', 'outstanding'],
    panels: ['topService', 'topStaff', 'revenueTrend'],
    features: {
      walkIn: false,
      resources: true,
      commissions: false,
      waitingRoom: true,
      clientBirthDate: true,
      clientGender: true,
      clientInsurance: true
    },
    suggestedTags: ['Urgence', 'Enfant', 'Suivi orthodontie', 'Mutuelle'],
    expenseCategories: ['Consommables', 'Prothésiste', 'Matériel', ...COMMON_EXPENSES]
  },
  doctor: {
    id: 'doctor',
    label: 'Médecin',
    description: 'Cabinet médical',
    icon: 'Stethoscope',
    client: t('Patient', 'Patients'),
    staff: t('Médecin', 'Médecins'),
    staffNavLabel: 'Médecins',
    service: t('Acte', 'Actes'),
    resource: t('Salle', 'Salles', true),
    defaultStaffRole: 'Médecin',
    defaultServices: [
      { name: 'Consultation', category: 'Consultations', durationMin: 20, price: 250 },
      { name: 'Contrôle', category: 'Consultations', durationMin: 15, price: 150 },
      { name: 'Suivi', category: 'Consultations', durationMin: 20, price: 200 },
      { name: 'Certificat médical', category: 'Administratif', durationMin: 10, price: 150 },
      { name: 'Électrocardiogramme', category: 'Examens', durationMin: 20, price: 300 }
    ],
    suggestedResources: ['Salle de consultation 1', "Salle d'examen"],
    defaultAppointmentDurationMin: 20,
    slotStepMin: 10,
    kpis: ['todayCount', 'upcoming', 'waiting', 'outstanding'],
    panels: ['topService', 'topStaff', 'revenueTrend'],
    features: {
      walkIn: false,
      resources: false,
      commissions: false,
      waitingRoom: true,
      clientBirthDate: true,
      clientGender: true,
      clientInsurance: true
    },
    suggestedTags: ['Urgence', 'Enfant', 'Suivi chronique', 'Mutuelle'],
    expenseCategories: ['Consommables', 'Matériel médical', ...COMMON_EXPENSES]
  },
  physio: {
    id: 'physio',
    label: 'Kinésithérapeute',
    description: 'Rééducation, massages',
    icon: 'Activity',
    client: t('Patient', 'Patients'),
    staff: t('Kinésithérapeute', 'Kinésithérapeutes'),
    staffNavLabel: 'Praticiens',
    service: t('Soin', 'Soins'),
    resource: t('Box', 'Box'),
    defaultStaffRole: 'Kinésithérapeute',
    defaultServices: [
      { name: 'Bilan initial', category: 'Bilans', durationMin: 60, price: 300 },
      { name: 'Séance de rééducation', category: 'Rééducation', durationMin: 45, price: 200 },
      { name: 'Massage thérapeutique', category: 'Massages', durationMin: 45, price: 250 },
      { name: 'Séance à domicile', category: 'Rééducation', durationMin: 60, price: 350 }
    ],
    suggestedResources: ['Box 1', 'Box 2', 'Salle de rééducation'],
    defaultAppointmentDurationMin: 45,
    slotStepMin: 15,
    kpis: ['todayCount', 'upcoming', 'noShowRate', 'outstanding'],
    panels: ['topService', 'topStaff', 'revenueTrend'],
    features: {
      walkIn: false,
      resources: true,
      commissions: false,
      waitingRoom: true,
      clientBirthDate: true,
      clientGender: true,
      clientInsurance: true
    },
    suggestedTags: ['Sportif', 'Post-opératoire', 'Mutuelle'],
    expenseCategories: ['Matériel', 'Consommables', ...COMMON_EXPENSES]
  },
  spa: {
    id: 'spa',
    label: 'Spa / Bien-être',
    description: 'Hammam, massages, soins',
    icon: 'Flower2',
    client: t('Client', 'Clients'),
    staff: t('Praticien', 'Praticiens'),
    staffNavLabel: 'Équipe',
    service: t('Soin', 'Soins'),
    resource: t('Salle', 'Salles', true),
    defaultStaffRole: 'Praticien bien-être',
    defaultServices: [
      { name: 'Hammam traditionnel', category: 'Hammam', durationMin: 60, price: 200 },
      { name: 'Gommage au savon noir', category: 'Hammam', durationMin: 30, price: 150 },
      { name: 'Massage relaxant', category: 'Massages', durationMin: 60, price: 400 },
      { name: 'Massage aux pierres chaudes', category: 'Massages', durationMin: 75, price: 500 },
      { name: 'Soin du visage', category: 'Soins', durationMin: 60, price: 350 },
      { name: 'Forfait hammam + massage', category: 'Forfaits', durationMin: 120, price: 550 }
    ],
    suggestedResources: ['Salle de massage 1', 'Salle de massage 2', 'Hammam'],
    defaultAppointmentDurationMin: 60,
    slotStepMin: 15,
    kpis: ['todayCount', 'todayRevenue', 'upcoming', 'weekRevenue'],
    panels: ['topService', 'topStaff', 'revenueTrend'],
    features: {
      walkIn: true,
      resources: true,
      commissions: true,
      waitingRoom: true,
      clientBirthDate: true,
      clientGender: true,
      clientInsurance: false
    },
    suggestedTags: ['Fidèle', 'VIP', 'Couple', 'Carte cadeau'],
    expenseCategories: ['Produits', 'Linge', ...COMMON_EXPENSES]
  },
  coach: {
    id: 'coach',
    label: 'Coach',
    description: 'Sport, vie, carrière',
    icon: 'Dumbbell',
    client: t('Client', 'Clients'),
    staff: t('Coach', 'Coachs'),
    staffNavLabel: 'Coachs',
    service: t('Formule', 'Formules', true),
    resource: t('Salle', 'Salles', true),
    defaultStaffRole: 'Coach',
    defaultServices: [
      { name: 'Séance découverte', category: 'Séances', durationMin: 30, price: 100 },
      { name: 'Séance individuelle', category: 'Séances', durationMin: 60, price: 300 },
      { name: 'Séance en ligne', category: 'Séances', durationMin: 60, price: 250 },
      { name: 'Bilan', category: 'Bilans', durationMin: 45, price: 250 }
    ],
    suggestedResources: ['Salle 1', 'Studio'],
    defaultAppointmentDurationMin: 60,
    slotStepMin: 15,
    kpis: ['todayCount', 'upcoming', 'weekRevenue', 'newClients'],
    panels: ['topService', 'revenueTrend', 'outstanding'],
    features: {
      walkIn: false,
      resources: false,
      commissions: false,
      waitingRoom: false,
      clientBirthDate: true,
      clientGender: true,
      clientInsurance: false
    },
    suggestedTags: ['Abonné', 'En ligne', 'Objectif perte de poids'],
    expenseCategories: ['Matériel', ...COMMON_EXPENSES]
  },
  consultant: {
    id: 'consultant',
    label: 'Consultant',
    description: 'Conseil, accompagnement',
    icon: 'Briefcase',
    client: t('Client', 'Clients'),
    staff: t('Consultant', 'Consultants'),
    staffNavLabel: 'Consultants',
    service: t('Prestation', 'Prestations', true),
    resource: t('Salle', 'Salles', true),
    defaultStaffRole: 'Consultant',
    defaultServices: [
      { name: 'Consultation initiale', category: 'Consultations', durationMin: 60, price: 500 },
      { name: 'Rendez-vous de suivi', category: 'Consultations', durationMin: 45, price: 400 },
      { name: 'Audit', category: 'Missions', durationMin: 120, price: 1500 },
      { name: 'Atelier', category: 'Missions', durationMin: 180, price: 2000 }
    ],
    suggestedResources: ['Salle de réunion'],
    defaultAppointmentDurationMin: 60,
    slotStepMin: 15,
    kpis: ['todayCount', 'upcoming', 'weekRevenue', 'outstanding'],
    panels: ['topService', 'revenueTrend'],
    features: {
      walkIn: false,
      resources: false,
      commissions: false,
      waitingRoom: false,
      clientBirthDate: false,
      clientGender: false,
      clientInsurance: false
    },
    suggestedTags: ['Entreprise', 'Particulier', 'Prioritaire'],
    expenseCategories: ['Déplacements', 'Logiciels', ...COMMON_EXPENSES]
  },
  other: {
    id: 'other',
    label: 'Autre',
    description: 'Toute activité sur rendez-vous',
    icon: 'CalendarCheck',
    client: t('Client', 'Clients'),
    staff: t("Membre de l'équipe", "Membres de l'équipe"),
    staffNavLabel: 'Équipe',
    service: t('Service', 'Services'),
    resource: t('Ressource', 'Ressources', true),
    defaultStaffRole: 'Praticien',
    defaultServices: [
      { name: 'Rendez-vous', category: 'Général', durationMin: 30, price: 100 },
      { name: 'Consultation', category: 'Général', durationMin: 60, price: 200 }
    ],
    suggestedResources: ['Salle 1'],
    defaultAppointmentDurationMin: 30,
    slotStepMin: 15,
    kpis: ['todayCount', 'todayRevenue', 'upcoming', 'outstanding'],
    panels: ['topService', 'revenueTrend'],
    features: {
      walkIn: true,
      resources: false,
      commissions: false,
      waitingRoom: false,
      clientBirthDate: false,
      clientGender: false,
      clientInsurance: false
    },
    suggestedTags: ['Fidèle', 'VIP'],
    expenseCategories: COMMON_EXPENSES
  }
}

export const CATEGORY_ORDER: CategoryId[] = [
  'barber',
  'hair_salon',
  'beauty_salon',
  'dentist',
  'doctor',
  'physio',
  'spa',
  'coach',
  'consultant',
  'other'
]

export function getCategoryConfig(id: string | null | undefined): BusinessCategoryConfig {
  if (id && id in CATEGORIES) return CATEGORIES[id as CategoryId]
  return CATEGORIES.other
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && value in CATEGORIES
}

/** Horaires d'ouverture proposés à l'installation : lundi–samedi 9h–19h, pause 13h–14h pour les cabinets. */
export function defaultOpeningHours(categoryId: CategoryId): DaySchedule[] {
  const medical = categoryId === 'dentist' || categoryId === 'doctor' || categoryId === 'physio'
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const isSunday = weekday === 7
    const isSaturday = weekday === 6
    return {
      weekday,
      open: !isSunday,
      start: 9 * 60,
      end: isSaturday && medical ? 13 * 60 : 19 * 60,
      breaks: medical && !isSaturday ? [{ start: 13 * 60, end: 14 * 60 }] : []
    }
  })
}
