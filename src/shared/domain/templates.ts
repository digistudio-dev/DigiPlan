// Modèles de messages WhatsApp avec variables {{...}}.

export const TEMPLATE_VARIABLES: Array<{ key: string; label: string }> = [
  { key: 'client_name', label: 'Nom du client' },
  { key: 'business_name', label: "Nom de l'établissement" },
  { key: 'date', label: 'Date du rendez-vous' },
  { key: 'time', label: 'Heure du rendez-vous' },
  { key: 'service', label: 'Prestation(s)' },
  { key: 'staff_name', label: "Membre de l'équipe" },
  { key: 'address', label: 'Adresse' },
  { key: 'phone', label: "Téléphone de l'établissement" }
]

export type TemplateVariables = Partial<Record<string, string>>

export interface DefaultTemplate {
  key: 'confirmation' | 'reminder' | 'cancellation' | 'thanks'
  name: string
  body: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'confirmation',
    name: 'Confirmation de rendez-vous',
    body: [
      'Bonjour {{client_name}},',
      '',
      'Votre rendez-vous chez {{business_name}} est confirmé.',
      '',
      '📅 {{date}}',
      '🕐 {{time}}',
      '💼 {{service}}',
      '',
      'À bientôt.'
    ].join('\n')
  },
  {
    key: 'reminder',
    name: 'Rappel de rendez-vous',
    body: [
      'Bonjour {{client_name}},',
      '',
      'Petit rappel concernant votre rendez-vous chez {{business_name}}.',
      '',
      '📅 {{date}}',
      '🕐 {{time}}',
      '💼 {{service}}',
      '',
      'À bientôt.'
    ].join('\n')
  },
  {
    key: 'cancellation',
    name: 'Annulation de rendez-vous',
    body: [
      'Bonjour {{client_name}},',
      '',
      'Votre rendez-vous du {{date}} à {{time}} chez {{business_name}} a été annulé.',
      "N'hésitez pas à nous contacter pour en fixer un nouveau.",
      '',
      'Cordialement.'
    ].join('\n')
  },
  {
    key: 'thanks',
    name: 'Remerciement',
    body: ['Bonjour {{client_name}},', '', 'Merci pour votre visite chez {{business_name}}.', 'À très bientôt !'].join(
      '\n'
    )
  }
]

/** Remplace les variables connues ; les variables absentes deviennent une chaîne vide. */
export function renderTemplate(body: string, vars: TemplateVariables): string {
  return body
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => vars[key.toLowerCase()] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Variables utilisées dans un modèle et inconnues du système (aide à la saisie). */
export function unknownVariables(body: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.map((v) => v.key))
  const found = new Set<string>()
  for (const m of body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
    const key = m[1].toLowerCase()
    if (!known.has(key)) found.add(key)
  }
  return [...found]
}
