// Carte de connexion WhatsApp (QR code, statut, déconnexion).

import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { queryClient, useWhatsAppState } from '@/lib/queries'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { confirm } from '@/components/confirm'

export function WhatsAppConnection() {
  const { data: s } = useWhatsAppState()
  const connect = useMutation({
    mutationFn: () => api('whatsapp.connect'),
    onSuccess: (state) => queryClient.setQueryData(['whatsapp'], state),
    onError: (e) => toast.error(errorMessage(e, t.errors.whatsappConnect))
  })
  const disconnect = useMutation({
    mutationFn: () => api('whatsapp.disconnect'),
    onSuccess: (state) => {
      queryClient.setQueryData(['whatsapp'], state)
      toast.success('WhatsApp déconnecté')
    },
    onError: (e) => toast.error(errorMessage(e))
  })
  if (!s) return <Card className="h-[220px]" />

  const busy = s.status === 'initializing' || s.status === 'authenticated' || connect.isPending

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#25d366]/12 text-[#1fa855]">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[0.9rem] font-semibold">
            WhatsApp
            <StatusPill status={s.status} />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {s.status === 'ready'
              ? [s.accountName, s.accountNumber].filter(Boolean).join(' · ') || t.whatsapp.connected
              : s.error ?? t.whatsapp.sessionInfo}
          </div>
        </div>
        {s.status === 'ready' ? (
          <Button
            onClick={async () => {
              if (await confirm({ title: t.whatsapp.disconnectTitle, body: t.whatsapp.disconnectBody, confirmLabel: t.whatsapp.disconnect })) disconnect.mutate()
            }}
            loading={disconnect.isPending}
          >
            <LogOut /> {t.whatsapp.disconnect}
          </Button>
        ) : s.status === 'qr' || busy ? (
          <Button variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {t.common.cancel}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => connect.mutate()} loading={connect.isPending} disabled={!s.browserFound}>
            {s.status === 'disconnected' || s.status === 'error' ? <RefreshCw /> : <QrCode />}
            {s.status === 'disconnected' || s.status === 'error' ? t.whatsapp.reconnect : t.whatsapp.connect}
          </Button>
        )}
      </div>

      {s.status === 'qr' && s.qrDataUrl ? (
        <div className="flex items-center gap-8 border-t border-border bg-surface-2/40 px-6 py-5">
          <div className="rounded-xl bg-white p-3 shadow-md">
            <img src={s.qrDataUrl} alt="QR code WhatsApp" className="size-[220px]" />
          </div>
          <div>
            <div className="text-[0.9rem] font-semibold">{t.whatsapp.scanTitle}</div>
            <ol className="mt-3 space-y-2 text-[0.8125rem] text-muted-foreground">
              {t.whatsapp.scanSteps.map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[0.6875rem] font-semibold text-primary-soft-foreground">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-subtle-foreground">Le code se renouvelle automatiquement toutes les 20 secondes environ.</p>
          </div>
        </div>
      ) : busy ? (
        <div className="flex items-center gap-3 border-t border-border bg-surface-2/40 px-5 py-4 text-[0.8125rem] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t.whatsapp.status[s.status === 'authenticated' ? 'authenticated' : 'initializing']}
          <span className="text-xs text-subtle-foreground">— cela peut prendre jusqu’à une minute. Vous pouvez continuer à utiliser DigiPlan.</span>
        </div>
      ) : !s.browserFound ? (
        <div className="flex items-center gap-2 border-t border-border bg-danger-soft px-5 py-3 text-xs text-danger">
          <AlertCircle className="size-4" /> {t.whatsapp.browserMissing}
        </div>
      ) : null}
    </Card>
  )
}

function StatusPill({ status }: { status: keyof typeof t.whatsapp.status }) {
  const tone =
    status === 'ready' ? 'bg-success-soft text-success' : status === 'error' || status === 'disconnected' ? 'bg-danger-soft text-danger' : status === 'qr' || status === 'initializing' || status === 'authenticated' ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-muted-foreground'
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-medium ${tone}`}>
      {status === 'ready' ? <CheckCircle2 className="size-3" /> : null}
      {t.whatsapp.status[status]}
    </span>
  )
}
