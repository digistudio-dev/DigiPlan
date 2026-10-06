// Aperçu du reçu avec impression et export PDF.

import { useMutation, useQuery } from '@tanstack/react-query'
import { FileDown, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/primitives'

export function ReceiptDialog() {
  const paymentId = useUi((s) => s.receiptPaymentId)
  const openReceipt = useUi((s) => s.openReceipt)
  const { data: html, isLoading } = useQuery({
    queryKey: ['payments', 'receipt', paymentId],
    queryFn: () => api('receipts.html', { paymentId: paymentId! }),
    enabled: Boolean(paymentId)
  })
  const print = useMutation({ mutationFn: () => api('receipts.print', { paymentId: paymentId! }), onError: (e) => toast.error(errorMessage(e)) })
  const pdf = useMutation({
    mutationFn: () => api('receipts.pdf', { paymentId: paymentId! }),
    onSuccess: (r) => r.saved && toast.success(t.payments.pdfSaved, { description: r.path }),
    onError: (e) => toast.error(errorMessage(e))
  })

  return (
    <Dialog
      open={paymentId !== null}
      onOpenChange={(o) => !o && openReceipt(null)}
      title={t.payments.receipt}
      size="md"
      footer={
        <>
          <Button onClick={() => pdf.mutate()} loading={pdf.isPending}>
            <FileDown /> {t.payments.exportPdf}
          </Button>
          <Button variant="primary" onClick={() => print.mutate()} loading={print.isPending}>
            <Printer /> {t.common.print}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {isLoading || !html ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-48 bg-slate-200" />
            <Skeleton className="h-40 bg-slate-200" />
          </div>
        ) : (
          // iframe isolé, sans script : le contenu du reçu est échappé côté processus principal.
          <iframe title={t.payments.receipt} srcDoc={html} sandbox="" className="h-[560px] w-full" />
        )}
      </div>
    </Dialog>
  )
}
