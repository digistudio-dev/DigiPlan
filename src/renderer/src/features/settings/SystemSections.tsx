// Paramètres → Sauvegardes, Licence, À propos.

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, DatabaseBackup, Download, ExternalLink, FolderOpen, HardDrive, KeyRound, RotateCcw, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { BackupInfo } from '@shared/types'
import { formatDateLong, formatDateTime } from '@shared/format'
import { VENDOR_URL } from '@shared/constants'
import { api, errorMessage } from '@/lib/api'
import { useApp } from '@/hooks/useApp'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card, SettingRow, Skeleton, Switch } from '@/components/ui/primitives'
import { EmptyState, FormSection, LogoMark, Select, Wordmark } from '@/components/common'
import { confirm } from '@/components/confirm'
import { SectionTitle, useUpdateSettings } from './shared'
import { useActivateLicense } from '../licensing/UpgradeDialog'
import wordmarkUrl from '@/assets/brand/digiplan-wordmark.png'

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`)

// ---------- Sauvegardes ----------
export function BackupsSection() {
  const { settings } = useApp()
  const update = useUpdateSettings()
  const status = useQuery({ queryKey: ['backup', 'status'], queryFn: () => api('backup.status') })
  const list = useQuery({ queryKey: ['backups'], queryFn: () => api('backup.list') })
  const [restoring, setRestoring] = useState(false)

  const create = useMutation({
    mutationFn: () => api('backup.create'),
    onSuccess: (b) => {
      toast.success(t.backups.created, { description: b.fileName })
      void status.refetch()
    },
    onError: (e) => toast.error(errorMessage(e))
  })
  const chooseDir = useMutation({ mutationFn: () => api('backup.chooseDirectory'), onSuccess: () => void status.refetch(), onError: (e) => toast.error(errorMessage(e)) })

  const restore = async (filePath: string, label: string) => {
    const check = await api('backup.verify', { filePath })
    if (!check.ok) return toast.error(check.message)
    const ok = await confirm({
      title: t.backups.restoreTitle,
      body: (
        <>
          <p>
            Sauvegarde : <b className="text-foreground">{label}</b>
            {check.businessName ? ` — ${check.businessName}` : ''}
          </p>
          {check.counts ? (
            <p className="mt-1">
              Contenu : {check.counts.clients} fiches, {check.counts.appointments} rendez-vous, {check.counts.payments} paiements.
            </p>
          ) : null}
          <p className="mt-3">{t.backups.restoreBody}</p>
        </>
      ),
      confirmLabel: t.backups.restore,
      acknowledge: t.backups.restoreConfirmLabel
    })
    if (!ok) return
    setRestoring(true)
    try {
      await api('backup.restore', { filePath })
    } catch (e) {
      setRestoring(false)
      toast.error(errorMessage(e))
    }
  }

  const fromFile = async () => {
    try {
      const picked = await api('backup.pickFile')
      if (picked) await restore(picked.filePath, picked.filePath.split(/[\\/]/).pop() ?? picked.filePath)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (restoring) {
    return <EmptyState icon={<RotateCcw className="animate-spin" />} title={t.backups.restoring} description="DigiPlan va redémarrer automatiquement." />
  }

  return (
    <>
      <SectionTitle title={t.backups.title} description="Vos données sont enregistrées sur cet ordinateur. Copiez régulièrement vos sauvegardes sur une clé USB ou un cloud." />
      <div className="space-y-5">
        <Card className="flex items-center gap-4 px-5 py-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-success-soft text-success">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.9rem] font-semibold">{t.backups.last}</div>
            <div className="text-xs text-muted-foreground">
              {status.data?.lastBackupAt ? formatDateTime(status.data.lastBackupAt) : t.backups.never}
              {status.data?.lastError ? <span className="block text-danger">{status.data.lastError}</span> : null}
            </div>
          </div>
          <Button variant="primary" onClick={() => create.mutate()} loading={create.isPending}>
            <DatabaseBackup /> {t.backups.create}
          </Button>
        </Card>

        <FormSection title="Sauvegarde automatique">
          <div className="divide-y divide-border">
            <SettingRow title={t.backups.auto} description="Une sauvegarde est créée chaque jour au démarrage ou pendant l’utilisation.">
              <Switch checked={settings.backupAutoEnabled} onCheckedChange={(v) => update.mutate({ backupAutoEnabled: v })} />
            </SettingRow>
            <SettingRow title={t.backups.retention} description="Les sauvegardes manuelles ne sont jamais supprimées automatiquement.">
              <Select className="w-[120px]" value={String(settings.backupRetention)} onChange={(v) => update.mutate({ backupRetention: Number(v) })} options={[7, 14, 30, 60, 90].map((n) => ({ value: String(n), label: String(n) }))} />
            </SettingRow>
            <SettingRow title={t.backups.directory} description={<span className="selectable break-all">{status.data?.directory}</span>}>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => void api('app.openFolder', { target: 'backups' })}>
                  <FolderOpen /> {t.backups.openDirectory}
                </Button>
                <Button size="sm" onClick={() => chooseDir.mutate()}>
                  {t.backups.changeDirectory}
                </Button>
              </div>
            </SettingRow>
          </div>
        </FormSection>

        <FormSection title={t.backups.list}>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={fromFile}>
              <Upload /> {t.backups.restoreFromFile}
            </Button>
          </div>
          {list.isLoading ? (
            <Skeleton className="h-24" />
          ) : !list.data?.length ? (
            <div className="py-6 text-center text-xs text-subtle-foreground">{t.backups.empty}</div>
          ) : (
            <ul className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {list.data.map((b: BackupInfo) => (
                <li key={b.filePath} className="flex items-center gap-3 px-3 py-2 text-[0.8125rem]">
                  <HardDrive className="size-4 text-subtle-foreground" />
                  <span className="tabular flex-1">{formatDateTime(b.createdAt)}</span>
                  <Badge tone={b.kind === 'manual' ? 'primary' : 'neutral'}>{t.backups.kinds[b.kind]}</Badge>
                  <span className="w-[64px] text-right text-xs text-muted-foreground">{size(b.sizeBytes)}</span>
                  <Button size="sm" variant="ghost" onClick={() => void restore(b.filePath, formatDateTime(b.createdAt))}>
                    <RotateCcw /> {t.backups.restore}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </FormSection>

        <FormSection title="Exports">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['clients', 'Clients'],
                ['appointments', 'Rendez-vous'],
                ['payments', 'Paiements']
              ] as const
            ).map(([kind, label]) => (
              <Button
                key={kind}
                size="sm"
                onClick={async () => {
                  try {
                    const r = await api('export.csv', { kind })
                    if (r.saved) toast.success(`${label} exportés (${r.rows})`)
                  } catch (e) {
                    toast.error(errorMessage(e))
                  }
                }}
              >
                <Download /> {label} (CSV)
              </Button>
            ))}
          </div>
        </FormSection>
      </div>
    </>
  )
}

// ---------- Licence ----------
export function LicenseSection() {
  const { license } = useApp()
  const [code, setCode] = useState('')
  const activate = useActivateLicense(() => setCode(''))
  return (
    <>
      <SectionTitle title={t.license.title} />
      {license.edition === 'pro' ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 bg-gradient-to-r from-[#0e6be6] to-[#18a5f2] px-5 py-5 text-white">
            <Sparkles className="size-7" />
            <div>
              <div className="text-lg font-semibold">{t.license.pro}</div>
              <div className="text-[0.8125rem] opacity-90">{t.license.activated}</div>
            </div>
          </div>
          <div className="space-y-2 px-5 py-4 text-[0.8125rem]">
            {license.activatedAt ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.license.activatedOn}</span>
                <span className="font-medium">{formatDateLong(license.activatedAt)}</span>
              </div>
            ) : null}
            <ul className="grid grid-cols-2 gap-1.5 pt-2">
              {t.license.benefits.map((b) => (
                <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" /> {b}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="px-5 py-4">
            <div className="flex items-center gap-2 text-[0.95rem] font-semibold">
              {t.license.free}
              <Badge>Édition actuelle</Badge>
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">Passez à DigiPlan Pro pour débloquer :</p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5">
              {t.license.benefits.map((b) => (
                <li key={b} className="flex items-center gap-2 text-xs">
                  <Sparkles className="size-3.5 text-primary" /> {b}
                </li>
              ))}
            </ul>
          </Card>
          <FormSection title={t.license.code}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) activate.mutate(code)
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t.license.codePlaceholder}
                className="font-mono tracking-wider"
                leading={<KeyRound />}
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" variant="primary" loading={activate.isPending} disabled={!code.trim()}>
                {t.license.activate}
              </Button>
            </form>
            <p className="mt-2 text-xs text-subtle-foreground">{t.license.contact}</p>
          </FormSection>
        </div>
      )}
    </>
  )
}

// ---------- À propos ----------
export function AboutSection() {
  const { data: info } = useQuery({ queryKey: ['app', 'info'], queryFn: () => api('app.info'), staleTime: Infinity })
  return (
    <>
      <div className="flex flex-col items-center py-6 text-center">
        <img src={wordmarkUrl} alt="DigiPlan" className="w-[260px] dark:rounded-xl dark:bg-white dark:px-4 dark:py-2" draggable={false} />
        <div className="mt-5 text-[0.8125rem] text-muted-foreground">Version {info?.version ?? '—'}</div>
        <div className="mt-1 text-[0.8125rem]">
          Développé par <span className="font-semibold">DigiStudio.dev</span>
        </div>
        <button type="button" onClick={() => void api('app.openExternal', { url: VENDOR_URL })} className="mt-1 flex items-center gap-1 text-[0.8125rem] text-primary hover:underline">
          digistudio.dev <ExternalLink className="size-3" />
        </button>
      </div>
      <FormSection title="Informations techniques">
        <dl className="space-y-2 text-xs">
          {[
            ['Version', info?.version],
            ['Moteur', info ? `Electron ${info.electron}` : ''],
            ['Données', info?.dataPath],
            ['Base de données', info?.databasePath],
            ['Journal', info?.logsPath]
          ].map(([k, v]) => (
            <div key={k} className="flex gap-4">
              <dt className="w-[120px] shrink-0 text-muted-foreground">{k}</dt>
              <dd className="selectable font-mono break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => void api('app.openFolder', { target: 'data' })}>
            <FolderOpen /> Dossier des données
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void api('app.openFolder', { target: 'logs' })}>
            <FolderOpen /> Journal technique
          </Button>
        </div>
      </FormSection>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-subtle-foreground">
        <LogoMark size={16} /> <Wordmark /> © {new Date().getFullYear()} DigiStudio.dev — Tous droits réservés.
      </div>
    </>
  )
}
