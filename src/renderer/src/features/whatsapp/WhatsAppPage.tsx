// WhatsApp (Pro) : connexion, modèles de messages, historique des rappels.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, MessageCircle, Plus, RotateCcw, Sparkles, Trash2, Bell, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { MessageTemplateDto, ReminderStatus } from '@shared/types'
import { TEMPLATE_VARIABLES, renderTemplate, unknownVariables } from '@shared/domain/templates'
import { formatDateFull, formatDateTime, formatTime } from '@shared/format'
import { api, errorMessage } from '@/lib/api'
import { useTemplates } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge, Card, CardHeader, Segmented } from '@/components/ui/primitives'
import { EmptyState, PageHeader } from '@/components/common'
import { confirm } from '@/components/confirm'
import { WhatsAppConnection } from './WhatsAppConnection'

export default function WhatsAppPage() {
  const { isPro } = useApp()
  const gate = useProGate()
  if (!isPro) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={t.whatsapp.title} />
        <EmptyState
          className="flex-1"
          icon={<MessageCircle />}
          title="Rappels et messages WhatsApp"
          description="Connectez le WhatsApp de votre établissement pour envoyer automatiquement confirmations et rappels, et réduire les absences."
          action={
            <Button variant="primary" onClick={() => gate('whatsapp')}>
              <Sparkles /> Activer DigiPlan Pro
            </Button>
          }
        />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.whatsapp.title} subtitle="Rappels automatiques, confirmations et messages à vos clients." />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-5 px-6 py-5">
          <WhatsAppConnection />
          <TemplatesEditor />
          <History />
        </div>
      </div>
    </div>
  )
}

const SAMPLE = {
  client_name: 'Salma Bennani',
  date: formatDateFull(Date.now() + 86400_000),
  time: formatTime(new Date().setHours(14, 30, 0, 0)),
  service: 'Brushing',
  staff_name: 'Karim'
}

function TemplatesEditor() {
  const { business } = useApp()
  const { data: templates = [] } = useTemplates()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = templates.find((x) => x.id === selectedId) ?? templates[0] ?? null
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (selected) {
      setName(selected.name)
      setBody(selected.body)
    }
  }, [selected])

  const save = useMutation({
    mutationFn: (tpl: { id?: string; name: string; body: string }) => api('templates.save', tpl),
    onSuccess: (tpl) => {
      setSelectedId(tpl.id)
      toast.success('Modèle enregistré')
    },
    onError: (e) => toast.error(errorMessage(e))
  })
  const reset = useMutation({ mutationFn: (id: string) => api('templates.reset', { id }), onSuccess: () => toast.success('Modèle réinitialisé') })

  const preview = useMemo(
    () => renderTemplate(body, { ...SAMPLE, business_name: business?.name ?? '', address: [business?.address, business?.city].filter(Boolean).join(', '), phone: business?.phone ?? '' }),
    [body, business]
  )
  const unknown = unknownVariables(body)
  const dirty = selected && (name !== selected.name || body !== selected.body)

  const insert = (key: string) => {
    const el = textRef.current
    const token = `{{${key}}}`
    if (!el) return setBody((b) => b + token)
    const start = el.selectionStart
    const next = body.slice(0, start) + token + body.slice(el.selectionEnd)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <Card>
      <CardHeader
        title={t.whatsapp.templates}
        action={
          <Button size="sm" variant="ghost" onClick={() => save.mutate({ name: 'Nouveau modèle', body: 'Bonjour {{client_name}},\n\n' })}>
            <Plus /> {t.whatsapp.newTemplate}
          </Button>
        }
      />
      <div className="grid grid-cols-[220px_minmax(0,1fr)_300px] divide-x divide-border">
        <ul className="p-2">
          {templates.map((tpl: MessageTemplateDto) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => setSelectedId(tpl.id)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem]', selected?.id === tpl.id ? 'bg-surface-2 font-medium' : 'text-muted-foreground hover:bg-surface-2/60')}
              >
                <span className="truncate">{tpl.name}</span>
                {tpl.isSystem ? <Badge className="ml-auto">Système</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="space-y-3 p-4">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={selected.isSystem} aria-label="Nom du modèle" />
            <Textarea ref={textRef} value={body} onChange={(e) => setBody(e.target.value)} rows={11} className="font-mono text-xs leading-relaxed" aria-label="Contenu du modèle" />
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t.whatsapp.variables}</div>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground hover:border-primary hover:text-primary">
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
              {unknown.length ? <p className="mt-2 text-xs text-warning">Variable inconnue : {unknown.map((u) => `{{${u}}}`).join(', ')}</p> : null}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="primary" size="sm" disabled={!dirty || !body.trim()} loading={save.isPending} onClick={() => save.mutate({ id: selected.id, name, body })}>
                <Check /> {t.common.save}
              </Button>
              {selected.isSystem ? (
                <Button size="sm" variant="ghost" onClick={() => reset.mutate(selected.id)}>
                  <RotateCcw /> {t.whatsapp.resetTemplate}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger-ghost"
                  onClick={async () => {
                    if (await confirm({ title: 'Supprimer ce modèle ?', confirmLabel: t.common.delete })) {
                      await api('templates.delete', { id: selected.id })
                      setSelectedId(null)
                    }
                  }}
                >
                  <Trash2 /> {t.common.delete}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}
        <div className="bg-[#efeae2] p-4 dark:bg-[#0b141a]">
          <div className="mb-2 text-xs font-medium text-[#54656f] dark:text-[#8696a0]">{t.whatsapp.preview}</div>
          <div className="relative max-w-[260px] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
            {preview || <span className="opacity-50">…</span>}
            <div className="mt-1 text-right text-[0.6rem] opacity-50">{formatTime(Date.now())}</div>
          </div>
        </div>
      </div>
    </Card>
  )
}

const STATUS_TONE: Record<ReminderStatus, 'success' | 'danger' | 'warning' | 'neutral' | 'primary'> = {
  sent: 'success',
  failed: 'danger',
  skipped: 'neutral',
  scheduled: 'primary',
  sending: 'warning',
  cancelled: 'neutral'
}
const STATUS_LABEL: Record<ReminderStatus, string> = {
  sent: 'Envoyé',
  failed: 'Échec',
  skipped: 'Ignoré',
  scheduled: 'Programmé',
  sending: 'En cours',
  cancelled: 'Annulé'
}

function History() {
  const [status, setStatus] = useState<'all' | 'scheduled' | 'sent' | 'failed' | 'skipped'>('all')
  const { data = [], refetch, isFetching } = useQuery({ queryKey: ['reminders', status], queryFn: () => api('reminders.list', { status, limit: 200 }) })
  const retry = useMutation({ mutationFn: (id: string) => api('reminders.retry', { id }), onSuccess: () => toast.success('Nouvel envoi programmé'), onError: (e) => toast.error(errorMessage(e)) })
  return (
    <Card>
      <CardHeader
        icon={<Bell />}
        title={t.whatsapp.history}
        action={
          <div className="flex items-center gap-2">
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: t.common.all },
                { value: 'scheduled', label: 'Programmés' },
                { value: 'sent', label: 'Envoyés' },
                { value: 'failed', label: 'Échecs' },
                { value: 'skipped', label: 'Ignorés' }
              ]}
            />
            <Button size="icon-sm" variant="ghost" aria-label="Actualiser" onClick={() => void refetch()}>
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      />
      {data.length === 0 ? (
        <EmptyState compact title={t.whatsapp.historyEmpty} description="Activez le rappel automatique lors de la prise de rendez-vous." />
      ) : (
        <table className="w-full text-[0.8125rem]">
          <thead>
            <tr className="text-left text-[0.6875rem] tracking-wide text-subtle-foreground uppercase">
              <th className="py-2 pl-4 font-medium">Client</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Rendez-vous</th>
              <th className="py-2 font-medium">Envoi</th>
              <th className="py-2 font-medium">Statut</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 pl-4 font-medium">{r.clientName}</td>
                <td className="py-2 text-muted-foreground">{t.whatsapp.reminderKinds[r.kind]}</td>
                <td className="tabular py-2 text-muted-foreground">{formatDateTime(r.appointmentStartAt)}</td>
                <td className="tabular py-2 text-muted-foreground">{formatDateTime(r.sentAt ?? r.scheduledAt)}</td>
                <td className="max-w-[260px] py-2">
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  {r.error ? <div className="truncate text-[0.6875rem] text-muted-foreground" title={r.error}>{r.error}</div> : null}
                </td>
                <td className="py-2 pr-4 text-right">
                  {r.status === 'failed' ? (
                    <Button size="sm" variant="ghost" onClick={() => retry.mutate(r.id)}>
                      <RotateCcw /> {t.whatsapp.retry}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
