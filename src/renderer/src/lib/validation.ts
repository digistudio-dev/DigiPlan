import { z } from 'zod'
import { isPlausiblePhone } from '@shared/domain/phone'
import { t } from '@/i18n'

export const optionalPhone = z
  .string()
  .trim()
  .refine((v) => !v || isPlausiblePhone(v), t.validation.phone)

export const requiredPhone = z
  .string()
  .trim()
  .min(1, t.validation.required)
  .refine((v) => isPlausiblePhone(v), t.validation.phone)

export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || z.email().safeParse(v).success, t.validation.email)

export const requiredText = (max = 120) => z.string().trim().min(1, t.validation.required).max(max)
