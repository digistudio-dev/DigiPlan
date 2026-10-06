// Composition d'un message WhatsApp manuel : rien n'est envoyé sans clic explicite sur « Envoyer ».

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { formatPhone } from '@shared/domain/phone'
import { api, errorMessage } from '@/lib/api'
import { useTemplates, useWhatsAppState } from '@/lib/queries'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/common'

export function WhatsAppComposer() {
  const ctx = useUi((s) => s.composer)
  const openComposer = useUi((s) => s.openComposer)
  const navigate = useUi((s) => s.navigate)
  const { data: templates = [] } = useTemplates()
  const { data: wa } = useWhatsAppState()
  const [templateId, setTemplateId] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const compose = useQuery({
    queryKey: ['whatsapp', 'compose', ctx?.appointmentId, ctx?.clientId, templateId],
    queryFn: () => api('whatsapp.compose', { appointmentId: ctx?.appointmentId, clientId: ctx?.clientId, templateId: templateId || undefined }),
    enabled: Boolean(ctx),
    staleTime: 0
  })
  useEffect(() => {
    if (compose.data) {
      setPhone((p) => p || formatPhone(compose.data.phone))
      setMessage(compose.data.message)
    }
  }, [compose.data])
  useEffect(() => {
    if (!ctx) {
      setTemplateId('')
      setPhone('')
      setMessage('')
    }
  }, [ctx])

  const send = useMutation({
    mutationFn: () => api('whatsapp.send', { phone, message, appointmentId: ctx?.appointmentId, clientId: ctx?.clientId }),
    onSuccess: () => {
      toast.success(t.whatsapp.sent)
      openComposer(null)
    },
    onError: (e) => toast.error(errorMessage(e))
  })
  const ready = wa?.status === 'ready'

  return (
    <Dialog
      open={ctx !== null}
      onOpenChange={(o) => !o && openComposer(null)}
      title={t.whatsapp.composerTitle}
      description={compose.data?.clientName}
      footer={
        <>
          <Button variant="ghost" onClick={() => openComposer(null)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => send.mutate()} loading={send.isPending} disabled={!ready || !message.trim() || !phone.trim()}>
            <Send /> {t.whatsapp.send}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!ready ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            <span className="flex items-center gap-2">
              <AlertCircle className="size-4" /> {t.whatsapp.composerNotReady}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                openComposer(null)
                navigate('whatsapp')
              }}
            >
              {t.whatsapp.connect}
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.phone}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t.whatsapp.composerTemplate}>
            <Select
              value={templateId || '__auto'}
              onChange={(v) => setTemplateId(v === '__auto' ? '' : v)}
              options={[{ value: '__auto', label: 'Par défaut' }, ...templates.map((x) => ({ value: x.id, label: x.name }))]}
            />
          </Field>
        </div>
        <Field label={t.whatsapp.composerMessage}>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} />
        </Field>
      </div>
    </Dialog>
  )
}
