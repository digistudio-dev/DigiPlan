// Liste des clients / patients : recherche, filtres, tri, pagination.

import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Download, Search, Tag as TagIcon, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateShort, formatRelativeDay } from '@shared/format'
import { api, errorMessage } from '@/lib/api'
import { useTags } from '@/lib/queries'
import { useApp } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, Segmented, Skeleton } from '@/components/ui/primitives'
import { EmptyState, Money, PageHeader, Phone, Select } from '@/components/common'

type Filter = 'active' | 'balance' | 'archived'
type Sort = 'name' | 'recent' | 'lastVisit' | 'spent'
const PAGE = 50

export default function ClientsPage() {
  const { terms, currency } = useApp()
  const ui = useUi()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<Sort>('name')
  const [tag, setTag] = useState<string>('')
  const { data: tags = [] } = useTags()

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 200)
    return () => clearTimeout(id)
  }, [search])

  const query = useInfiniteQuery({
    queryKey: ['clients', 'list', q, filter, sort, tag],
    queryFn: ({ pageParam }) => api('clients.list', { search: q || undefined, filter, sort, tag: tag || undefined, page: pageParam, pageSize: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length : undefined)
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0

  const exportCsv = async () => {
    try {
      const r = await api('export.csv', { kind: 'clients' })
      if (r.saved) toast.success(`${r.rows} fiches exportées`, { description: r.path })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const noClientsAtAll = !query.isLoading && total === 0 && !q && filter === 'active' && !tag

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={terms.client.plural}
        subtitle={query.isLoading ? ' ' : t.clients.count(total, terms.client.singular, terms.client.plural)}
        actions={
          <>
            <Button onClick={exportCsv}>
              <Download /> {t.common.export}
            </Button>
            <Button variant="primary" onClick={() => ui.openClientForm()}>
              <UserPlus /> {terms.client.newLabel}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[320px]">
            <Input leading={<Search />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.clients.searchPlaceholder} autoFocus />
          </div>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: t.clients.filterActive },
              { value: 'balance', label: t.clients.filterBalance },
              { value: 'archived', label: t.clients.filterArchived }
            ]}
          />
          {tags.length ? (
            <Select
              className="w-[170px]"
              value={tag || '__all'}
              onChange={(v) => setTag(v === '__all' ? '' : v)}
              options={[{ value: '__all', label: <span className="flex items-center gap-1.5"><TagIcon className="size-3.5" /> Toutes les étiquettes</span> }, ...tags.map((x) => ({ value: x, label: x }))]}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Trier par
            <Select
              className="w-[150px]"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              options={[
                { value: 'name', label: t.clients.sortName },
                { value: 'recent', label: t.clients.sortRecent },
                { value: 'lastVisit', label: t.clients.sortLastVisit },
                { value: 'spent', label: t.clients.sortSpent }
              ]}
            />
          </div>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {noClientsAtAll ? (
          <EmptyState
            icon={<Users />}
            title={`Vous n'avez pas encore ajouté de ${terms.client.lower}.`}
            description={`Ajoutez vos ${terms.client.lowerPlural} pour planifier leurs rendez-vous et suivre leur historique.`}
            action={
              <Button variant="primary" onClick={() => ui.openClientForm()}>
                <UserPlus /> Ajouter votre {terms.client.first} {terms.client.lower}
              </Button>
            }
          />
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="text-left text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">
                <th className="border-b border-border py-2 pl-6 font-medium">{t.clients.columns.name}</th>
                <th className="border-b border-border py-2 font-medium">{t.clients.columns.phone}</th>
                <th className="border-b border-border py-2 font-medium">{t.clients.columns.lastVisit}</th>
                <th className="border-b border-border py-2 font-medium">{t.clients.columns.next}</th>
                <th className="border-b border-border py-2 text-right font-medium">{t.clients.columns.spent}</th>
                <th className="border-b border-border py-2 pr-6 text-right font-medium">{t.clients.columns.balance}</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="border-b border-border px-6 py-2.5">
                        <Skeleton className="h-6" />
                      </td>
                    </tr>
                  ))
                : items.map((c) => {
                    const name = `${c.firstName} ${c.lastName}`.trim()
                    return (
                      <tr
                        key={c.id}
                        tabIndex={0}
                        onClick={() => ui.openClient(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && ui.openClient(c.id)}
                        className="cursor-pointer transition-colors hover:bg-surface-2/70 focus:bg-surface-2 focus:outline-none"
                      >
                        <td className="border-b border-border py-2 pl-6">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={name} size={28} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{name}</div>
                              {c.tags.length ? (
                                <div className="flex gap-1">
                                  {c.tags.slice(0, 3).map((x) => (
                                    <span key={x} className="text-[0.6875rem] text-subtle-foreground">
                                      #{x}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-border py-2 text-muted-foreground">
                          <Phone value={c.phone} />
                        </td>
                        <td className="tabular border-b border-border py-2 text-muted-foreground">{c.lastAppointmentAt ? formatDateShort(c.lastAppointmentAt) : <span className="text-subtle-foreground">{t.clients.never}</span>}</td>
                        <td className="border-b border-border py-2">
                          {c.nextAppointmentAt ? <span className="text-primary">{formatRelativeDay(c.nextAppointmentAt)}</span> : <span className="text-subtle-foreground">—</span>}
                        </td>
                        <td className="border-b border-border py-2 text-right">
                          <Money cents={c.totalSpent} currency={currency} />
                        </td>
                        <td className={cn('border-b border-border py-2 pr-6 text-right', c.balance > 0 ? 'font-medium text-warning' : 'text-subtle-foreground')}>
                          {c.balance > 0 ? <Money cents={c.balance} currency={currency} /> : '—'}
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        )}
        {!query.isLoading && items.length === 0 && !noClientsAtAll ? <EmptyState compact title="Aucun résultat" description="Modifiez votre recherche ou vos filtres." /> : null}
        {query.hasNextPage ? (
          <div className="flex justify-center py-4">
            <Button onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {t.clients.loadMore} ({total - items.length})
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
