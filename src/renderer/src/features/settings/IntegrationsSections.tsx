// Paramètres → Intégrations : WhatsApp et Google Calendar.

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarCheck2, ExternalLink, Loader2, LogOut, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@shared/format'
import { api, errorMessage } from '@/lib/api'
import { queryClient, useGoogleState } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Card, SettingRow, Switch } from '@/components/ui/primitives'
import { EmptyState, FormSection, Select } from '@/components/common'
import { confirm } from '@/components/confirm'
import { WhatsAppConnection } from '../whatsapp/WhatsAppConnection'
import { SectionTitle } from './shared'

function ProLocked({ feature, title, description }: { feature: 'whatsapp' | 'googleCalendar'; title: string; description: string }) {
  const gate = useProGate()
  return (
    <Card>
      <EmptyState
        icon={<Sparkles />}
        title={title}
        description={description}
        action={
          <Button variant="primary" onClick={() => gate(feature)}>
            Activer DigiPlan Pro
          </Button>
        }
      />
    </Card>
  )
}

export function WhatsAppSection() {
  const { isPro } = useApp()
  const navigate = useUi((s) => s.navigate)
  return (
    <>
      <SectionTitle title={t.settings.sections.whatsapp} description="Connectez le WhatsApp de l’établissement pour les confirmations et rappels automatiques." />
      {!isPro ? (
        <ProLocked feature="whatsapp" title="WhatsApp est inclus dans DigiPlan Pro" description="Rappels automatiques, confirmations et messages directs depuis la fiche client." />
      ) : (
        <div className="space-y-5">
          <WhatsAppConnection />
          <FormSection title="Modèles et historique">
            <SettingRow title="Modèles de messages" description="Confirmation, rappel, annulation, remerciement…">
              <Button size="sm" onClick={() => navigate('whatsapp')}>
                Gérer les modèles
              </Button>
            </SettingRow>
            <SettingRow title="Rappels automatiques" description="Délais et règles d’envoi.">
              <Button size="sm" variant="ghost" onClick={() => navigate('settings', 'notifications')}>
                Configurer
              </Button>
            </SettingRow>
          </FormSection>
          <p className="text-xs leading-relaxed text-subtle-foreground">
            DigiPlan utilise WhatsApp Web via le navigateur Microsoft Edge installé sur cet ordinateur. Gardez DigiPlan ouvert pour que les rappels partent à l’heure ; à la réouverture, les rappels encore utiles sont envoyés automatiquement.
          </p>
        </div>
      )}
    </>
  )
}

export function GoogleSection() {
  const { isPro } = useApp()
  const { data: g } = useGoogleState()
  const setState = (s: Awaited<ReturnType<typeof api<'google.state'>>>) => queryClient.setQueryData(['google'], s)
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '' })

  const connect = useMutation({ mutationFn: () => api('google.connect'), onSuccess: (s) => { setState(s); toast.success('Compte Google connecté') }, onError: (e) => toast.error(errorMessage(e)) })
  const disconnect = useMutation({ mutationFn: () => api('google.disconnect'), onSuccess: setState, onError: (e) => toast.error(errorMessage(e)) })
  const setSync = useMutation({ mutationFn: (enabled: boolean) => api('google.setSync', { enabled }), onSuccess: setState, onError: (e) => toast.error(errorMessage(e)) })
  const syncNow = useMutation({ mutationFn: () => api('google.syncNow'), onSuccess: (s) => { setState(s); toast.success('Synchronisation effectuée') }, onError: (e) => toast.error(errorMessage(e)) })
  const select = useMutation({ mutationFn: (v: { id: string; name: string }) => api('google.selectCalendar', v), onSuccess: setState, onError: (e) => toast.error(errorMessage(e)) })
  const saveCreds = useMutation({ mutationFn: () => api('google.setCredentials', creds), onSuccess: (s) => { setState(s); toast.success(t.common.saved) }, onError: (e) => toast.error(errorMessage(e)) })
  const calendars = useQuery({ queryKey: ['google', 'calendars'], queryFn: () => api('google.calendars'), enabled: Boolean(isPro && g?.connected) })

  if (!isPro) {
    return (
      <>
        <SectionTitle title={t.google.title} />
        <ProLocked feature="googleCalendar" title="Google Calendar est inclus dans DigiPlan Pro" description="Retrouvez automatiquement vos rendez-vous DigiPlan dans votre agenda Google, sur votre téléphone." />
      </>
    )
  }
  if (!g) return null

  return (
    <>
      <SectionTitle title={t.google.title} description={t.google.oneWay} />
      <div className="space-y-5">
        <Card className="flex items-center gap-4 px-5 py-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarCheck2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.9rem] font-semibold">{g.connected ? 'Compte connecté' : 'Non connecté'}</div>
            <div className="truncate text-xs text-muted-foreground">{g.connected ? (g.accountEmail ?? 'Compte Google') : g.configured ? 'Connectez un compte pour synchroniser vos rendez-vous.' : 'Renseignez d’abord les identifiants OAuth ci-dessous (voir la documentation).'}</div>
          </div>
          {g.connected ? (
            <Button
              onClick={async () => {
                if (await confirm({ title: t.google.disconnectTitle, body: t.google.disconnectBody, confirmLabel: t.google.disconnect })) disconnect.mutate()
              }}
              loading={disconnect.isPending}
            >
              <LogOut /> {t.google.disconnect}
            </Button>
          ) : connect.isPending ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {t.google.connecting}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void api('google.cancelConnect')}>
                {t.common.cancel}
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => connect.mutate()} disabled={!g.configured}>
              {t.google.connect}
            </Button>
          )}
        </Card>

        {g.connected ? (
          <FormSection title="Synchronisation">
            <div className="divide-y divide-border">
              <SettingRow title={t.google.calendar}>
                <Select
                  className="w-[260px]"
                  placeholder={calendars.isLoading ? t.common.loading : t.google.chooseCalendar}
                  value={g.calendarId}
                  onChange={(id) => select.mutate({ id, name: calendars.data?.find((c) => c.id === id)?.summary ?? id })}
                  options={(calendars.data ?? []).map((c) => ({ value: c.id, label: c.summary, hint: c.primary ? 'Principal' : undefined }))}
                />
              </SettingRow>
              <SettingRow title={t.google.sync} description={t.google.syncHint}>
                <Switch checked={g.syncEnabled} disabled={!g.calendarId} onCheckedChange={(v) => setSync.mutate(v)} />
              </SettingRow>
              <SettingRow
                title={t.google.lastSync}
                description={
                  <>
                    {g.lastSyncAt ? formatDateTime(g.lastSyncAt) : 'Jamais'}
                    {g.pendingCount ? ` · ${t.google.pending(g.pendingCount)}` : ''}
                    {g.lastError ? <span className="block text-danger">{g.lastError}</span> : null}
                  </>
                }
              >
                <Button size="sm" onClick={() => syncNow.mutate()} loading={syncNow.isPending} disabled={!g.syncEnabled}>
                  <RefreshCw /> {t.google.syncNow}
                </Button>
              </SettingRow>
            </div>
          </FormSection>
        ) : null}

        <FormSection title={t.google.credentials} description={t.google.credentialsHint}>
          {g.credentialsSource === 'bundled' ? (
            <p className="text-[0.8125rem] text-muted-foreground">Identifiants fournis avec cette version de DigiPlan. Aucune configuration nécessaire.</p>
          ) : (
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), saveCreds.mutate())}>
              {g.credentialsSource === 'custom' ? <p className="text-xs text-success">Identifiants personnalisés enregistrés.</p> : null}
              <Field label={t.google.clientId}>
                <Input value={creds.clientId} onChange={(e) => setCreds({ ...creds, clientId: e.target.value })} placeholder="xxxxxxxx.apps.googleusercontent.com" spellCheck={false} />
              </Field>
              <Field label={t.google.clientSecret}>
                <Input type="password" value={creds.clientSecret} onChange={(e) => setCreds({ ...creds, clientSecret: e.target.value })} spellCheck={false} />
              </Field>
              <div className="flex items-center justify-between">
                <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => void api('app.openExternal', { url: 'https://console.cloud.google.com/apis/credentials' })}>
                  Ouvrir Google Cloud Console <ExternalLink className="size-3" />
                </button>
                <Button type="submit" size="sm" disabled={!creds.clientId.trim()} loading={saveCreds.isPending}>
                  {t.google.saveCredentials}
                </Button>
              </div>
            </form>
          )}
        </FormSection>
      </div>
    </>
  )
}
