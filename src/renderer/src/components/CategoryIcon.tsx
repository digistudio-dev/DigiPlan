import { Activity, Briefcase, CalendarCheck, Dumbbell, Flower2, Scissors, Smile, Sparkles, Stethoscope, Wind, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = { Activity, Briefcase, CalendarCheck, Dumbbell, Flower2, Scissors, Smile, Sparkles, Stethoscope, Wind }

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CalendarCheck
  return <Icon className={className} />
}
