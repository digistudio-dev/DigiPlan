import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useBootstrap } from './lib/queries'
import { useUi } from './stores/ui'
import { useApplyTheme } from './hooks/useTheme'
import { TooltipProvider } from './components/ui/primitives'
import { ConfirmHost } from './components/confirm'
import { OnboardingWizard } from './features/onboarding/OnboardingWizard'
import { AppShell } from './components/layout/AppShell'
import { EmptyState } from './components/common'
import { Button } from './components/ui/button'
import { t } from './i18n'

function hideSplash() {
  const splash = document.getElementById('splash')
  if (!splash) return
  splash.style.opacity = '0'
  setTimeout(() => splash.remove(), 220)
}

export function App() {
  const { data, error, refetch, isFetching } = useBootstrap()
  const dark = useApplyTheme(data?.settings.theme)
  const onboardingActive = useUi((s) => s.onboardingActive)

  useEffect(() => {
    if (data || error) hideSplash()
  }, [data, error])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          title={t.errors.load}
          description={error.message}
          action={
            <Button onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="animate-spin" /> : null}
              {t.common.retry}
            </Button>
          }
        />
      </div>
    )
  }
  if (!data) return null

  return (
    <TooltipProvider>
      {data.business?.onboardedAt && !onboardingActive ? <AppShell /> : <OnboardingWizard />}
      <ConfirmHost />
      <Toaster
        position="bottom-left"
        offset={{ bottom: 16, left: 16 }}
        theme={dark ? 'dark' : 'light'}
        toastOptions={{
          className: '!rounded-lg !border !border-border !bg-surface !text-foreground !shadow-lg !text-[0.8125rem]',
          duration: 3500
        }}
      />
    </TooltipProvider>
  )
}
