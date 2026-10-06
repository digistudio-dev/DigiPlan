// Sélecteur de client avec recherche instantanée (nom ou téléphone).

import { useEffect, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Search, UserPlus, X } from 'lucide-react'
import { formatPhone } from '@shared/domain/phone'
import { api } from '@/lib/api'
import { useApp } from '@/hooks/useApp'
import { cn } from '@/lib/utils'
import { Avatar, Popover, PopoverAnchor, PopoverContent } from '@/components/ui/primitives'

export interface PickedClient {
  id: string
  name: string
  phone: string
}

export function ClientPicker({
  value,
  onChange,
  onCreateNew,
  autoFocus,
  invalid
}: {
  value: PickedClient | null
  onChange: (c: PickedClient | null) => void
  onCreateNew?: (search: string) => void
  autoFocus?: boolean
  invalid?: boolean
}) {
  const { terms } = useApp()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 150)
    return () => clearTimeout(id)
  }, [search])

  const { data } = useQuery({
    queryKey: ['clients', 'picker', debounced],
    queryFn: () => api('clients.list', { search: debounced || undefined, filter: 'active', sort: debounced ? 'name' : 'lastVisit', page: 0, pageSize: 8 }),
    enabled: open,
    placeholderData: keepPreviousData
  })
  const items = data?.items ?? []
  const options = [...items.map((c) => ({ kind: 'client' as const, c })), ...(onCreateNew ? [{ kind: 'new' as const }] : [])]

  useEffect(() => setActive(0), [debounced])

  const select = (i: number) => {
    const o = options[i]
    if (!o) return
    if (o.kind === 'new') onCreateNew?.(search)
    else onChange({ id: o.c.id, name: `${o.c.firstName} ${o.c.lastName}`.trim(), phone: o.c.phone })
    setOpen(false)
    setSearch('')
  }

  if (value && !open) {
    return (
      <div className="flex h-9 items-center gap-2.5 rounded-md border border-border bg-surface px-2 shadow-sm">
        <Avatar name={value.name} size={24} />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{value.name}</span>
        <span className="tabular text-xs text-muted-foreground">{formatPhone(value.phone)}</span>
        <button
          type="button"
          aria-label="Changer"
          onClick={() => {
            onChange(null)
            setOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-subtle-foreground" />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            aria-invalid={invalid || undefined}
            value={search}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, options.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && open) {
                e.preventDefault()
                select(active)
              } else if (e.key === 'Escape' && open) {
                e.stopPropagation()
                setOpen(false)
              }
            }}
            placeholder={`Rechercher ${terms.client.a} (nom ou téléphone)…`}
            className="h-9 w-full rounded-md border border-border bg-surface pr-8 pl-8 text-[0.8125rem] shadow-sm hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-ring/60 focus:outline-none aria-[invalid=true]:border-danger"
          />
          <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault()
        }}
      >
        <ul role="listbox" className="max-h-[280px] overflow-y-auto">
          {items.length === 0 && debounced ? <li className="px-2.5 py-2 text-xs text-muted-foreground">Aucun résultat pour « {debounced} »</li> : null}
          {options.map((o, i) =>
            o.kind === 'client' ? (
              <li
                key={o.c.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(i)}
                className={cn('flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2', i === active && 'bg-surface-2')}
              >
                <Avatar name={`${o.c.firstName} ${o.c.lastName}`} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8125rem] font-medium">{`${o.c.firstName} ${o.c.lastName}`.trim()}</div>
                  {o.c.balance > 0 ? <div className="text-[0.6875rem] text-warning">Solde restant</div> : null}
                </div>
                <span className="tabular text-xs text-muted-foreground">{formatPhone(o.c.phone)}</span>
                {value?.id === o.c.id ? <Check className="size-3.5 text-primary" /> : null}
              </li>
            ) : (
              <li
                key="new"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(i)}
                className={cn('mt-1 flex h-9 cursor-pointer items-center gap-2.5 rounded-md border-t border-border px-2 text-[0.8125rem] font-medium text-primary', i === active && 'bg-primary-soft/60')}
              >
                <UserPlus className="size-4" />
                {terms.client.newLabel}
                {search.trim() ? <span className="truncate text-muted-foreground">« {search.trim()} »</span> : null}
              </li>
            )
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
