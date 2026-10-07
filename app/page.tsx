'use client'

import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  Home,
  Menu,
  Minus,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  ReceiptText,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Trash2,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type Section =
  | 'Inicio'
  | 'Nueva venta'
  | 'Platos'
  | 'Ingredientes'
  | 'Ventas'
  | 'Caja'
  | 'Reportes'
  | 'Configuración'
type RecipeLine = { ingredientId: number; name: string }
type Product = {
  id: number
  name: string
  price: number
  category: string
  ingredients: string[]
  recipe: RecipeLine[]
  available: boolean
}
type Ingredient = {
  id: number
  name: string
}
type OrderLine = {
  key: string
  product: Product
  quantity: number
  excludedIngredients: string[]
  note: string
}
type SaleItem = {
  name: string
  category: string
  quantity: number
  unitPrice: number
  total: number
  excludedIngredients: string[]
  note: string | null
}
type Sale = {
  id: number
  createdAt: string
  status: 'completed' | 'cancelled'
  cancellationReason: string | null
  cancelledAt: string | null
  cancelledBy?: number | null
  serviceType: 'takeaway' | 'dine_in' | null
  customerName: string | null
  tableNumber: string | null
  total: number
  subtotal: number
  paymentMethod: string
  cashReceived: number | null
  change: number
  items: SaleItem[]
}
type DashboardData = {
  grossSales: number
  netSales: number
  discounts: number
  taxes: number
  commissions: number
  total: number
  orderCount: number
  cancelledCount: number
  cancelledOrders: {
    id: number
    createdAt: string
    cancelledAt: string | null
    total: number
    paymentMethod: string
    serviceType: string | null
    customerName: string | null
    tableNumber: string | null
    reason: string
    cancelledByName: string
  }[]
  itemCount: number
  average: number
  bestSeller: { name: string; quantity: number } | null
  topProducts: { name: string; category: string; quantity: number; total: number }[]
  lowProducts: { name: string; category: string; quantity: number; total: number }[]
  categorySales: { category: string; total: number }[]
  paymentTotals: { cash: number; qr: number; card: number; transfer: number }
  channels: { dineIn: number; takeaway: number; unspecified: number }
  hourlySales: { hour: number; total: number }[]
  cashOpen: boolean
  recentSales: { id: number; createdAt: string; total: number; paymentMethod: string }[]
  reportOrders: {
    id: number
    createdAt: string
    items: {
      quantity: number
      name: string
      total: number
      excludedIngredients: string[]
      note: string | null
    }[]
    paymentMethod: string
    serviceType: string | null
    total: number
  }[]
}
type CashData = {
  open: boolean
  session: {
    id: number
    openedAt?: string
    closedAt?: string | null
    openingAmount?: number
    openingAmountCents?: number
    expectedAmount: number
    countedAmount?: number | null
    note?: string | null
  } | null
  expectedAmount?: number
  paymentTotals?: { cash: number; digital: number }
  salesCount?: number
  movements?: { id: number; type: string; amount: number; description: string; createdAt: string }[]
}
type CashHistoryEntry = {
  session: NonNullable<CashData['session']>
  paymentTotals: { cash: number; digital: number }
  expectedAmount: number
  salesCount: number
  movements: NonNullable<CashData['movements']>
}
type RestaurantSettings = { name: string; address: string; phone: string; currency: string }
type StaffUser = { id: number; name: string; email: string; role: 'admin' | 'cashier'; active: boolean }
type AuthUser = Omit<StaffUser, 'active'>

const navigation: { label: Section; icon: typeof Home }[] = [
  { label: 'Inicio', icon: Home },
  { label: 'Nueva venta', icon: ShoppingBag },
  { label: 'Platos', icon: UtensilsCrossed },
  { label: 'Ingredientes', icon: Boxes },
  { label: 'Ventas', icon: ReceiptText },
  { label: 'Caja', icon: Wallet },
  { label: 'Reportes', icon: BarChart3 },
  { label: 'Configuración', icon: Settings },
]
const money = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (date: string | Date) =>
  new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  }).format(new Date(date))
const boliviaDateInput = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `La solicitud falló (${response.status}).`
    throw new Error(message)
  }
  return payload as T
}

export default function Page() {
  const [section, setSection] = useState<Section>('Inicio')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [cash, setCash] = useState<CashData | null>(null)
  const [cashHistoryDate, setCashHistoryDate] = useState(boliviaDateInput)
  const [cashHistory, setCashHistory] = useState<CashHistoryEntry[]>([])
  const [cashHistoryLoading, setCashHistoryLoading] = useState(false)
  const [settings, setSettings] = useState<RestaurantSettings>({
    name: '',
    address: '',
    phone: '',
    currency: 'BOB',
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveInProgress = useRef(false)
  const [posQuery, setPosQuery] = useState('')
  const [posCategory, setPosCategory] = useState('Todos')
  const [order, setOrder] = useState<OrderLine[]>([])
  const [customizing, setCustomizing] = useState<Product | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null | undefined>(undefined)
  const [saleModal, setSaleModal] = useState(false)
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const saleInProgress = useRef(false)
  const [saleServiceType, setSaleServiceType] = useState<'takeaway' | 'dine_in'>('takeaway')
  const [saleCustomerName, setSaleCustomerName] = useState('')
  const [saleTableNumber, setSaleTableNumber] = useState('')
  const [printTicket, setPrintTicket] = useState<Sale | null>(null)
  const saleRequest = useRef<{ signature: string; id: string } | null>(null)
  const autoPrintedSaleId = useRef<number | null>(null)
  const [salePayment, setSalePayment] = useState('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [cashModal, setCashModal] = useState<'open' | 'close' | 'movement' | null>(null)
  const [reportRange, setReportRange] = useState('today')
  const [reportDate, setReportDate] = useState(boliviaDateInput)
  const [sales, setSales] = useState<Sale[]>([])
  const [salesRefresh, setSalesRefresh] = useState(0)
  const [salesRange, setSalesRange] = useState('today')
  const [search, setSearch] = useState('')
  const [cancellingSale, setCancellingSale] = useState<Sale | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellingSubmitting, setCancellingSubmitting] = useState(false)
  const cancellationInProgress = useRef(false)

  const reload = useCallback(async () => {
    try {
      setError('')
      const session = await api<AuthUser | null>('/api/auth/session')
      setUser(session)
      if (!session) {
        setLoading(false)
        return
      }
      const dashboardPath =
        section === 'Reportes'
          ? `/api/dashboard?range=${reportRange}&date=${encodeURIComponent(reportDate)}`
          : '/api/dashboard'
      const [dashboardData, productData, ingredientData, cashData, restaurantData] = await Promise.all([
        api<DashboardData>(dashboardPath),
        api<Product[]>('/api/products'),
        api<Ingredient[]>('/api/ingredients'),
        api<CashData>('/api/cash'),
        api<RestaurantSettings>('/api/settings'),
      ])
      setDashboard(dashboardData)
      setProducts(productData)
      setIngredients(ingredientData)
      setCash(cashData)
      setSettings(restaurantData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos.')
    } finally {
      setLoading(false)
    }
  }, [reportDate, reportRange, section])

  const reloadCashHistory = useCallback(async () => {
    setCashHistoryLoading(true)
    try {
      const history = await api<CashHistoryEntry[]>(
        `/api/cash?history=1&date=${encodeURIComponent(cashHistoryDate)}`,
      )
      setCashHistory(history)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial de caja.')
    } finally {
      setCashHistoryLoading(false)
    }
  }, [cashHistoryDate])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!user || section !== 'Caja') return
    void reloadCashHistory()
  }, [cash?.session?.closedAt, cash?.session?.id, reloadCashHistory, section, user])

  useEffect(() => {
    if (!user) return
    const interval = window.setInterval(() => void reload(), 30_000)
    return () => window.clearInterval(interval)
  }, [reload, user])

  useEffect(() => {
    const resetPrintMode = () => document.documentElement.classList.remove('printing-ticket', 'printing-report')
    window.addEventListener('afterprint', resetPrintMode)
    return () => window.removeEventListener('afterprint', resetPrintMode)
  }, [])

  useEffect(() => {
    if (!printTicket || autoPrintedSaleId.current === printTicket.id) return
    autoPrintedSaleId.current = printTicket.id
    const timeout = window.setTimeout(printTicketNow, 250)
    return () => window.clearTimeout(timeout)
  }, [printTicket])

  useEffect(() => {
    if (section !== 'Ventas') return
    const loadSales = () => {
      const now = new Date()
      const start = new Date(now)
      if (salesRange === 'today') start.setHours(0, 0, 0, 0)
      if (salesRange === 'week') start.setDate(start.getDate() - 6)
      if (salesRange === 'month') start.setDate(1)
      if (salesRange === 'all') start.setFullYear(2000, 0, 1)
      void api<Sale[]>(`/api/sales?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(now.toISOString())}`)
        .then(setSales)
        .catch(cause => setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.'))
    }
    loadSales()
    const interval = window.setInterval(loadSales, 30_000)
    return () => window.clearInterval(interval)
  }, [salesRefresh, section, salesRange])

  const notify = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }, [])

  function closePrintTicket() {
    autoPrintedSaleId.current = null
    document.documentElement.classList.remove('printing-ticket')
    setPrintTicket(null)
  }

  function printTicketNow() {
    document.documentElement.classList.remove('printing-report')
    document.documentElement.classList.add('printing-ticket')
    window.print()
  }

  function printReportNow() {
    document.documentElement.classList.remove('printing-ticket')
    document.documentElement.classList.add('printing-report')
    window.print()
  }

  const save = useCallback(
    async (path: string, method: string, body: unknown, message: string) => {
      if (saveInProgress.current) return false
      saveInProgress.current = true
      setSaving(true)
      try {
        setError('')
        await api(path, { method, body: JSON.stringify(body) })
        void reload()
        notify(message)
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar.')
        return false
      } finally {
        saveInProgress.current = false
        setSaving(false)
      }
    },
    [notify, reload],
  )

  const orderTotal = order.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const categories = useMemo(
    () => ['Todos', ...new Set(products.filter(product => product.available).map(product => product.category))],
    [products],
  )
  const visibleProducts = products.filter(
    product =>
      product.available &&
      (posCategory === 'Todos' || product.category === posCategory) &&
      product.name.toLocaleLowerCase().includes(posQuery.toLocaleLowerCase().trim()),
  )

  function addToOrder(product: Product, excludedIngredients: string[] = [], note = '') {
    setOrder(current => [
      ...current,
      { key: crypto.randomUUID(), product, quantity: 1, excludedIngredients, note },
    ])
  }

  function changeQuantity(key: string, change: number) {
    setOrder(current =>
      current
        .map(line => (line.key === key ? { ...line, quantity: line.quantity + change } : line))
        .filter(line => line.quantity > 0),
    )
  }

  async function confirmSale() {
    if (saleInProgress.current) return
    saleInProgress.current = true
    setSaleSubmitting(true)
    const amountReceived = salePayment === 'cash' ? Number(cashReceived) : undefined
    try {
      const payload = {
        paymentMethod: salePayment,
        cashReceived: amountReceived,
        serviceType: saleServiceType,
        customerName: saleCustomerName.trim(),
        tableNumber: saleServiceType === 'dine_in' ? saleTableNumber.trim() : null,
        items: order.map(line => ({
          productId: line.product.id,
          quantity: line.quantity,
          excludedIngredients: line.excludedIngredients,
          note: line.note,
        })),
      }
      const signature = JSON.stringify(payload)
      if (!saleRequest.current || saleRequest.current.signature !== signature) {
        saleRequest.current = { signature, id: crypto.randomUUID() }
      }
      const ticket = await api<Sale>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          requestId: saleRequest.current.id,
        }),
      })
      setError('')
      void reload()
      notify('Venta registrada. Preparando comanda para imprimir.')
      setPrintTicket(ticket)
      saleRequest.current = null
      setOrder([])
      setSaleModal(false)
      setCashReceived('')
      setSaleCustomerName('')
      setSaleTableNumber('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la venta.')
    } finally {
      saleInProgress.current = false
      setSaleSubmitting(false)
    }
  }

  async function saveProduct(values: Record<string, unknown>) {
    const isNew = !editingProduct
    const saved = await save(
      '/api/products',
      isNew ? 'POST' : 'PUT',
      isNew ? values : { ...values, id: editingProduct?.id },
      isNew ? 'Plato creado.' : 'Plato actualizado.',
    )
    if (saved) setEditingProduct(undefined)
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`¿Eliminar "${product.name}" del catálogo? Las ventas anteriores conservarán su detalle.`)) return
    const saved = await save(`/api/products?id=${product.id}`, 'DELETE', undefined, 'Plato eliminado.')
    if (saved) setEditingProduct(undefined)
  }

  async function saveIngredient(values: Record<string, unknown>) {
    const isNew = !editingIngredient
    const saved = await save(
      '/api/ingredients',
      isNew ? 'POST' : 'PUT',
      isNew ? values : { ...values, id: editingIngredient?.id },
      isNew ? 'Ingrediente creado.' : 'Ingrediente actualizado.',
    )
    if (saved) setEditingIngredient(undefined)
  }

  async function deleteIngredient(item: Ingredient) {
    if (
      !window.confirm(
        `¿Eliminar "${item.name}"? También se quitará de los platos que lo tengan incluido; el historial de ventas no cambiará.`,
      )
    ) return
    const saved = await save(`/api/ingredients?id=${item.id}`, 'DELETE', undefined, 'Ingrediente eliminado.')
    if (saved) setEditingIngredient(undefined)
  }

  async function performCashAction(values: Record<string, unknown>) {
    const saved = await save('/api/cash', 'POST', values, 'Movimiento de caja registrado.')
    if (saved) {
      setCashModal(null)
      if (section === 'Caja') void reloadCashHistory()
    }
  }

  async function saveSettings(values: RestaurantSettings) {
    await save('/api/settings', 'PUT', values, 'Configuración guardada.')
  }

  async function cancelSale(sale: Sale, reason: string) {
    if (cancellationInProgress.current) return
    cancellationInProgress.current = true
    setCancellingSubmitting(true)
    try {
      await api('/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({ id: sale.id, reason }),
      })
      setCancellingSale(null)
      setCancellationReason('')
      setSalesRefresh(current => current + 1)
      void reload()
      notify(`Pedido #${sale.id} anulado; caja actualizada.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo anular el pedido.')
    } finally {
      cancellationInProgress.current = false
      setCancellingSubmitting(false)
    }
  }

  const currentDate = new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'full',
    timeZone: 'America/La_Paz',
  }).format(new Date())
  const visibleNavigation = user?.role === 'admin'
    ? navigation
    : navigation.filter(item => ['Inicio', 'Nueva venta', 'Ventas', 'Caja'].includes(item.label))

  if (!loading && !user) {
    return <Login error={error} onLogin={() => void reload()} />
  }

  return (
    <div className="min-h-screen bg-[#f8f8f7] text-[#26221f]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#ece8e3] bg-white transition-transform lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-[#f0ece8] px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#f97316] text-white">
            <Store />
          </div>
          <div>
            <p className="text-sm font-bold tracking-[.18em]">{settings.name || 'RESTAURANTE'}</p>
            <p className="text-[11px] text-[#958d84]">Gestión del restaurante</p>
          </div>
        </div>
        <nav aria-label="Navegación principal" className="flex-1 px-3 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#aaa199]">
            Menú principal
          </p>
          {visibleNavigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                setSection(label)
                setMenuOpen(false)
                setSearch('')
              }}
              aria-current={section === label ? 'page' : undefined}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${
                section === label
                  ? 'bg-[#fff0e5] text-[#ea580c]'
                  : 'text-[#746b64] hover:bg-[#faf7f4]'
              }`}
            >
              <Icon aria-hidden="true" className="size-[18px]" />
              {label}
              {label === 'Nueva venta' && (
                <span className="ml-auto rounded-full bg-[#f97316] px-2 py-0.5 text-[10px] font-bold text-white">
                  POS
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="m-4 rounded-2xl bg-[#fff7f1] p-4">
          <div className="mb-2 flex items-center gap-2 text-[#ea580c]">
            <CircleDollarSign aria-hidden="true" className="size-4" />
            <span className="text-xs font-bold">Caja {cash?.open ? 'abierta' : 'cerrada'}</span>
          </div>
          <p className="text-xs text-[#8f8278]">Ventas de hoy</p>
          <p className="mt-1 text-lg font-bold">{money(dashboard?.total ?? 0)}</p>
        </div>
      </aside>

      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#ece8e3] bg-white/95 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{section}</h1>
              <p className="hidden text-xs capitalize text-[#978e86] sm:block">{currentDate} · La Paz, Bolivia</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div
              className={`hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold sm:flex ${
                cash?.open ? 'bg-[#fff7f1] text-[#ea580c]' : 'bg-[#f3efeb] text-[#746b64]'
              }`}
            >
              <span className={`size-2 rounded-full ${cash?.open ? 'bg-[#f97316]' : 'bg-[#aaa199]'}`} />
              Caja {cash?.open ? 'abierta' : 'cerrada'}
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#ffe0c7] text-sm font-bold text-[#c2410c]">
              <span aria-label={user?.name} title={user?.name}>{user?.name.slice(0, 1).toUpperCase()}</span>
            </span>
            <button
              aria-label="Actualizar datos"
              title="Actualizar datos"
              onClick={() => void reload()}
              className="rounded-lg p-2 text-[#746b64] hover:bg-[#fcfaf8] hover:text-[#ea580c]"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
            </button>
            <button
              onClick={async () => {
                try {
                  await api('/api/auth/logout', { method: 'POST' })
                  setUser(null)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'No se pudo cerrar la sesión.')
                }
              }}
              className="text-xs font-semibold text-[#746b64] hover:text-[#ea580c]"
            >
              Salir
            </button>
          </div>
        </header>

        <div className="min-w-0 p-4 sm:p-8">
          {error && (
            <div role="alert" className="mx-auto mb-5 flex max-w-[1400px] items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>{error}</span>
              <button aria-label="Cerrar error" onClick={() => setError('')} className="shrink-0">
                <X className="size-4" />
              </button>
            </div>
          )}
          {saving && (
            <p role="status" className="mx-auto mb-5 max-w-[1400px] rounded-xl bg-[#fff7f1] px-4 py-3 text-sm font-medium text-[#9a3412]">
              Guardando cambios…
            </p>
          )}
          {loading && (
            <p role="status" className="mx-auto max-w-[1400px] py-10 text-center text-sm text-[#746b64]">
              Conectando con la base de datos…
            </p>
          )}
          {!loading && section === 'Inicio' && (
            <Dashboard
              data={dashboard}
              onSell={() => setSection('Nueva venta')}
              onReports={() => setSection('Reportes')}
              onHistory={() => setSection('Ventas')}
            />
          )}
          {!loading && section === 'Nueva venta' && (
            <POS
              products={visibleProducts}
              categories={categories}
              category={posCategory}
              setCategory={setPosCategory}
              query={posQuery}
              setQuery={setPosQuery}
              order={order}
              total={orderTotal}
              onProduct={setCustomizing}
              onQty={changeQuantity}
              onRemove={key => setOrder(current => current.filter(item => item.key !== key))}
              onConfirm={() => {
                setSalePayment('cash')
                setCashReceived(orderTotal.toFixed(2))
                setSaleServiceType('takeaway')
                setSaleCustomerName('')
                setSaleTableNumber('')
                setSaleModal(true)
              }}
            />
          )}
          {!loading && section === 'Platos' && (
            <ProductManagement
              products={products}
              search={search}
              setSearch={setSearch}
              onAdd={() => setEditingProduct(null)}
              onEdit={setEditingProduct}
              onDelete={deleteProduct}
            />
          )}
          {!loading && section === 'Ingredientes' && (
            <IngredientManagement
              ingredients={ingredients}
              search={search}
              setSearch={setSearch}
              onAdd={() => setEditingIngredient(null)}
              onEdit={setEditingIngredient}
              onDelete={deleteIngredient}
            />
          )}
          {!loading && section === 'Ventas' && (
            <SalesHistory
              sales={sales}
              range={salesRange}
              setRange={setSalesRange}
              onPrint={() => window.print()}
              onPrintSale={setPrintTicket}
              isAdmin={user?.role === 'admin'}
              onCancelSale={setCancellingSale}
            />
          )}
          {!loading && section === 'Caja' && cash && (
            <CashManagement
              cash={cash}
              history={cashHistory}
              historyDate={cashHistoryDate}
              historyLoading={cashHistoryLoading}
              onHistoryDateChange={setCashHistoryDate}
              onOpen={() => setCashModal('open')}
              onClose={() => setCashModal('close')}
              onMovement={() => setCashModal('movement')}
            />
          )}
          {!loading && section === 'Reportes' && (
            <Reports
              data={dashboard}
              range={reportRange}
              setRange={setReportRange}
              date={reportDate}
              setDate={setReportDate}
              onPrint={printReportNow}
            />
          )}
          {!loading && section === 'Configuración' && (
            <SettingsPage settings={settings} user={user!} onSave={saveSettings} saving={saving} />
          )}
        </div>
      </main>

      {customizing && (
        <Customization
          product={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={(excludedIngredients, note) => {
            addToOrder(customizing, excludedIngredients, note)
            setCustomizing(null)
          }}
        />
      )}
      {editingProduct !== undefined && (
        <ProductForm
          product={editingProduct}
          ingredients={ingredients}
          onClose={() => setEditingProduct(undefined)}
          onSave={saveProduct}
          saving={saving}
        />
      )}
      {editingIngredient !== undefined && (
        <IngredientForm
          ingredient={editingIngredient}
          onClose={() => setEditingIngredient(undefined)}
          onSave={saveIngredient}
          onDelete={editingIngredient ? deleteIngredient : undefined}
          saving={saving}
        />
      )}
      {saleModal && (
        <SaleConfirmation
          total={orderTotal}
          serviceType={saleServiceType}
          setServiceType={setSaleServiceType}
          customerName={saleCustomerName}
          setCustomerName={setSaleCustomerName}
          tableNumber={saleTableNumber}
          setTableNumber={setSaleTableNumber}
          method={salePayment}
          setMethod={setSalePayment}
          cashReceived={cashReceived}
          setCashReceived={setCashReceived}
          onCancel={() => setSaleModal(false)}
          onConfirm={confirmSale}
          submitting={saleSubmitting}
        />
      )}
      {printTicket && (
        <Dialog title={`Comanda de la venta #${printTicket.id}`} onClose={closePrintTicket}>
          <p className="text-sm text-[#746b64]">La comanda está lista. Si cancelaste el diálogo de impresión, puedes imprimirla nuevamente.</p>
          <div className="mt-5 flex gap-3">
            <Button variant="outline" onClick={printTicketNow} className="h-11 flex-1 rounded-xl">
              <Printer data-icon="inline-start" /> Imprimir comanda
            </Button>
            <Button onClick={closePrintTicket} className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
              Continuar
            </Button>
          </div>
        </Dialog>
      )}
      {cashModal && cash && (
        <CashForm
          mode={cashModal}
          cash={cash}
          onClose={() => setCashModal(null)}
          onSubmit={performCashAction}
          saving={saving}
        />
      )}
      {cancellingSale && (
        <Dialog
          title={`Anular pedido #${cancellingSale.id}`}
          onClose={() => {
            setCancellingSale(null)
            setCancellationReason('')
          }}
        >
          <p className="text-sm text-[#746b64]">
            La anulación no modifica ingredientes. Si fue en efectivo, la devolución se registra como salida de la caja abierta, por lo que debe estar abierta.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Motivo de anulación
            <textarea
              required
              minLength={5}
              maxLength={500}
              value={cancellationReason}
              onChange={event => setCancellationReason(event.target.value)}
              className="mt-2 min-h-24 w-full rounded-xl border border-[#ece8e3] p-3 font-normal"
              placeholder="Explica por qué se anula este pedido"
            />
          </label>
          <div className="mt-5 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setCancellingSale(null)
                setCancellationReason('')
              }}
              className="h-11 flex-1 rounded-xl"
            >
              Volver
            </Button>
            <Button
              disabled={cancellationReason.trim().length < 5 || cancellingSubmitting}
              onClick={() => void cancelSale(cancellingSale, cancellationReason.trim())}
              className="h-11 flex-1 rounded-xl bg-red-700 text-white hover:bg-red-800"
            >
              {cancellingSubmitting ? 'Anulando…' : 'Anular pedido'}
            </Button>
          </div>
        </Dialog>
      )}
      {notice && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#29231f] px-4 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      )}
      {printTicket && (
        <div className="print-ticket" aria-hidden="true">
          <header className="ticket-header">
            <h1>{settings.name || 'RESTAURANTE'}</h1>
            {settings.address && <p>{settings.address}</p>}
            {settings.phone && <p>{settings.phone}</p>}
            <h2>COMANDA</h2>
            {printTicket.status === 'cancelled' && (
              <p className="ticket-cancelled">ANULADA · {printTicket.cancellationReason}</p>
            )}
            <p>Venta #{printTicket.id}</p>
            <p>{dateTime(printTicket.createdAt)}</p>
            <p>Atendió: {user?.name}</p>
            <p>{printTicket.serviceType === 'dine_in' ? 'COMER AQUÍ' : printTicket.serviceType === 'takeaway' ? 'PARA LLEVAR' : 'MODALIDAD NO REGISTRADA'}</p>
            {printTicket.tableNumber && <p>Mesa: {printTicket.tableNumber}</p>}
            {printTicket.customerName && <p>Llamar a: {printTicket.customerName}</p>}
          </header>
          <div className="ticket-items">
            {printTicket.items.map((item, index) => (
              <section className="ticket-item" key={`${printTicket.id}-${index}`}>
                <div className="ticket-item-heading">
                  <strong>{item.quantity} × {item.name}</strong>
                  <strong>{money(item.total)}</strong>
                </div>
                {item.excludedIngredients.length > 0 && (
                  <p className="ticket-modification">SIN: {item.excludedIngredients.join(', ')}</p>
                )}
                {item.note && <p className="ticket-note">Nota: {item.note}</p>}
              </section>
            ))}
          </div>
          <footer className="ticket-totals">
            <p><span>Pago</span><span>{paymentName(printTicket.paymentMethod)}</span></p>
            <p className="ticket-total"><span>TOTAL</span><strong>{money(printTicket.total)}</strong></p>
            {printTicket.paymentMethod === 'cash' && printTicket.cashReceived !== null && (
              <>
                <p><span>Recibido</span><span>{money(printTicket.cashReceived)}</span></p>
                <p><span>Cambio</span><span>{money(printTicket.change)}</span></p>
              </>
            )}
          </footer>
          {printTicket.status !== 'cancelled' && <p className="ticket-thanks">Gracias por su compra</p>}
        </div>
      )}
    </div>
  )
}

function Shell({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string
  eyebrow: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mx-auto min-w-0 max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-semibold text-[#f97316]">{eyebrow}</p>
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Dashboard({
  data,
  onSell,
  onReports,
  onHistory,
}: {
  data: DashboardData | null
  onSell: () => void
  onReports: () => void
  onHistory: () => void
}) {
  const stats = [
    { label: 'Ventas de hoy', value: money(data?.total ?? 0), detail: `${data?.orderCount ?? 0} ventas`, icon: CircleDollarSign },
    { label: 'Pedidos', value: String(data?.orderCount ?? 0), detail: `${data?.itemCount ?? 0} platos vendidos`, icon: ClipboardList },
    {
      label: 'Plato más vendido',
      value: data?.bestSeller?.name ?? 'Sin ventas',
      detail: data?.bestSeller ? `${data.bestSeller.quantity} unidades` : 'Se mostrará al registrar ventas',
      icon: UtensilsCrossed,
    },
    { label: 'Promedio por venta', value: money(data?.average ?? 0), detail: 'Ticket promedio del día', icon: CreditCard },
    {
      label: 'Estado de caja',
      value: data?.cashOpen ? 'Abierta' : 'Cerrada',
      detail: 'Estado de la caja y operaciones',
      icon: Wallet,
    },
  ]
  const maxHourly = Math.max(1, ...(data?.hourlySales.map(item => item.total) ?? [1]))
  return (
    <Shell
      title="Resumen del negocio"
      eyebrow={`Buenos días · ${new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }).format(new Date())}`}
      action={
        <Button onClick={onSell} className="rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
          <Plus data-icon="inline-start" /> Nueva venta
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="min-w-0 rounded-2xl border border-[#ece8e3] bg-white p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-[#958d84]">{label}</p>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#fff1e6] text-[#f97316]">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </div>
            <p className="break-words text-xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-[#746b64]">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-[#ece8e3] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Ventas por hora</h3>
              <p className="mt-1 text-xs text-[#958d84]">Importe registrado en la caja</p>
            </div>
            <span className="text-xs font-medium text-[#958d84]">Hoy · La Paz</span>
          </div>
          <div className="mt-8 flex h-52 min-w-0 items-end gap-1 sm:gap-2">
            {(data?.hourlySales ?? []).map(item => (
              <div key={item.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div
                  title={`${item.hour}:00 · ${money(item.total)}`}
                  className="w-full rounded-t-md bg-[#f97316]"
                  style={{ height: `${Math.max(2, (item.total / maxHourly) * 100)}%` }}
                />
                <span className="whitespace-nowrap text-[9px] text-[#aaa199] sm:text-[10px]">{item.hour}:00</span>
              </div>
            ))}
            {!data?.hourlySales.length && (
              <p className="w-full self-center text-center text-sm text-[#958d84]">Aún no hay ventas en este periodo.</p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-[#ece8e3] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Ventas recientes</h3>
              <p className="mt-1 text-xs text-[#958d84]">Movimientos registrados hoy</p>
            </div>
            <button className="text-xs font-semibold text-[#ea580c]" onClick={onHistory}>Ver historial</button>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            {data?.recentSales.length ? (
              data.recentSales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between gap-3 border-b border-[#f3efeb] pb-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">Venta #{sale.id}</p>
                    <p className="mt-1 text-xs text-[#958d84]">{dateTime(sale.createdAt)} · {paymentName(sale.paymentMethod)}</p>
                  </div>
                  <span className="shrink-0 font-bold">{money(sale.total)}</span>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-[#958d84]">Las ventas aparecerán aquí cuando registres la primera.</p>
            )}
          </div>
          <button onClick={onReports} className="mt-3 text-sm font-semibold text-[#ea580c]">Ir a reportes →</button>
        </section>
      </div>
    </Shell>
  )
}

function POS({
  products,
  categories,
  category,
  setCategory,
  query,
  setQuery,
  order,
  total,
  onProduct,
  onQty,
  onRemove,
  onConfirm,
}: {
  products: Product[]
  categories: string[]
  category: string
  setCategory: (value: string) => void
  query: string
  setQuery: (value: string) => void
  order: OrderLine[]
  total: number
  onProduct: (product: Product) => void
  onQty: (key: string, change: number) => void
  onRemove: (key: string) => void
  onConfirm: () => void
}) {
  return (
    <Shell
      title="Nueva venta"
      eyebrow="Punto de venta"
      action={
        <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs">
          <Clock3 aria-hidden="true" className="size-4 text-[#f97316]" /> Pedido nuevo
        </span>
      }
    >
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-5 flex min-w-0 flex-col gap-3">
            <label className="relative block min-w-0">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#aaa199]" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar plato..."
                aria-label="Buscar plato"
                className="h-11 w-full min-w-0 rounded-xl border border-[#ece8e3] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#f97316]"
              />
            </label>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Categorías">
              {categories.map(item => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  aria-pressed={category === item}
                  className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold ${
                    category === item ? 'bg-[#f97316] text-white' : 'border border-[#ece8e3] bg-white text-[#746b64]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          {products.length ? (
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map(product => (
                <button
                  key={product.id}
                  onClick={() => onProduct(product)}
                  className="group min-w-0 rounded-2xl border border-[#ece8e3] bg-white p-3 text-left hover:border-[#f97316] hover:shadow-lg hover:shadow-orange-100"
                >
                  <div className="mb-3 flex h-24 items-center justify-center rounded-xl bg-[#fff1e6] text-[#f97316] sm:h-28">
                    <UtensilsCrossed aria-hidden="true" className="size-9 opacity-60" />
                  </div>
                  <p className="truncate text-sm font-bold">{product.name}</p>
                  <p className="mt-1 truncate text-xs text-[#aaa199]">{product.category}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="truncate font-bold text-[#ea580c]">{money(product.price)}</span>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#fff0e5] text-[#f97316]">
                      <Plus aria-hidden="true" className="size-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#e4dcd4] bg-white p-10 text-center">
              <UtensilsCrossed aria-hidden="true" className="mx-auto size-8 text-[#c5b8ac]" />
              <p className="mt-3 font-semibold">No hay platos disponibles</p>
              <p className="mt-1 text-sm text-[#958d84]">
                {query ? 'Prueba con otra búsqueda o categoría.' : 'Crea platos desde la sección Platos para comenzar.'}
              </p>
            </div>
          )}
        </div>

        <section className="sticky bottom-2 z-10 flex max-h-[55vh] min-w-0 flex-col overflow-y-auto rounded-2xl border border-[#ece8e3] bg-white p-5 shadow-lg shadow-black/5 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)]">
          <div className="flex items-center justify-between border-b border-[#f0ece8] pb-4">
            <div>
              <h3 className="font-bold">Pedido actual</h3>
              <p className="mt-1 text-xs text-[#958d84]">{order.reduce((count, line) => count + line.quantity, 0)} productos</p>
            </div>
            <ShoppingBag aria-hidden="true" className="size-5 text-[#f97316]" />
          </div>
          <div className="flex min-h-24 flex-1 flex-col gap-4 overflow-y-auto py-4">
            {order.length ? (
              order.map(line => (
                <div key={line.key} className="flex justify-between gap-2 border-b border-[#f5f1ed] pb-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{line.quantity} × {line.product.name}</p>
                    {line.excludedIngredients.length > 0 && (
                      <p className="mt-1 text-xs text-[#ea580c]">Sin {line.excludedIngredients.join(', ')}</p>
                    )}
                    {line.note && <p className="mt-1 break-words text-xs text-[#746b64]">Nota: {line.note}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        aria-label={`Quitar una unidad de ${line.product.name}`}
                        onClick={() => onQty(line.key, -1)}
                        className="rounded-md border p-1"
                      >
                        <Minus aria-hidden="true" className="size-3" />
                      </button>
                      <button
                        aria-label={`Agregar una unidad de ${line.product.name}`}
                        onClick={() => onQty(line.key, 1)}
                        className="rounded-md border p-1"
                      >
                        <Plus aria-hidden="true" className="size-3" />
                      </button>
                      <button
                        aria-label={`Eliminar ${line.product.name} del pedido`}
                        onClick={() => onRemove(line.key)}
                        className="ml-1 rounded-md p-1 text-[#958d84] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <span className="shrink-0 font-bold">{money(line.product.price * line.quantity)}</span>
                </div>
              ))
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-[#aaa199]">
                Selecciona un plato para comenzar
              </div>
            )}
          </div>
          <div className="flex justify-between border-t border-[#f0ece8] pt-4 text-lg font-bold">
            <span>Total</span>
            <span className="text-[#ea580c]">{money(total)}</span>
          </div>
          <Button
            disabled={!order.length}
            onClick={onConfirm}
            className="mt-4 h-12 w-full rounded-xl bg-[#f97316] font-bold text-white hover:bg-[#ea580c]"
          >
            Cobrar y confirmar
          </Button>
        </section>
      </div>
    </Shell>
  )
}

function ProductManagement({
  products,
  search,
  setSearch,
  onAdd,
  onEdit,
  onDelete,
}: {
  products: Product[]
  search: string
  setSearch: (value: string) => void
  onAdd: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
}) {
  const filtered = products.filter(product => product.name.toLowerCase().includes(search.toLowerCase().trim()))
  return (
    <Shell
      title="Platos"
      eyebrow="Catálogo"
      action={
        <Button onClick={onAdd} className="rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
          <Plus data-icon="inline-start" /> Nuevo plato
        </Button>
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar plato..." />
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#ece8e3] bg-white">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#fcfaf8] text-xs text-[#958d84]">
              <tr>
                {['Nombre', 'Categoría', 'Precio', 'Ingredientes', 'Estado', 'Acciones'].map(label => (
                  <th key={label} className="px-5 py-3 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id} className="border-t border-[#f3efeb]">
                  <td className="px-5 py-4 font-semibold">{product.name}</td>
                  <td className="px-5 py-4 text-[#746b64]">{product.category}</td>
                  <td className="px-5 py-4 text-[#746b64]">{money(product.price)}</td>
                  <td className="px-5 py-4 text-[#746b64]">
                    {product.recipe.length
                      ? product.recipe.map(line => line.name).join(', ')
                      : 'Sin ingredientes'}
                  </td>
                  <td className="px-5 py-4"><StatusBadge active={product.available} /></td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <IconButton label={`Editar ${product.name}`} onClick={() => onEdit(product)}><Pencil /></IconButton>
                      <IconButton label={`Eliminar ${product.name}`} onClick={() => onDelete(product)}><Trash2 /></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 p-4 md:hidden">
          {filtered.map(product => (
            <div key={product.id} className="rounded-xl border border-[#f0ece8] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{product.name}</p>
                  <p className="mt-1 text-sm text-[#746b64]">{product.category} · {money(product.price)}</p>
                </div>
                <StatusBadge active={product.available} />
              </div>
              <p className="mt-2 text-xs text-[#958d84]">
                {product.recipe.length ? `${product.recipe.length} ingredientes incluidos` : 'Sin ingredientes configurados'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => onEdit(product)} className="rounded-lg"><Pencil data-icon="inline-start" /> Editar</Button>
                <Button variant="outline" onClick={() => onDelete(product)} className="rounded-lg text-red-700"><Trash2 data-icon="inline-start" /> Eliminar</Button>
              </div>
            </div>
          ))}
        </div>
        {!filtered.length && <EmptyState text={search ? 'No hay platos que coincidan con la búsqueda.' : 'Aún no hay platos. Crea el primero para habilitar ventas.'} />}
      </div>
    </Shell>
  )
}

function IngredientManagement({
  ingredients,
  search,
  setSearch,
  onAdd,
  onEdit,
  onDelete,
}: {
  ingredients: Ingredient[]
  search: string
  setSearch: (value: string) => void
  onAdd: () => void
  onEdit: (ingredient: Ingredient) => void
  onDelete: (ingredient: Ingredient) => void
}) {
  const filtered = ingredients.filter(item => item.name.toLowerCase().includes(search.toLowerCase().trim()))
  return (
    <Shell
      title="Ingredientes"
      eyebrow="Catálogo de ingredientes"
      action={
        <Button onClick={onAdd} className="rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
          <Plus data-icon="inline-start" /> Nuevo ingrediente
        </Button>
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar ingrediente..." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(item => (
          <article key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#ece8e3] bg-white p-4">
            <h3 className="min-w-0 truncate font-bold">{item.name}</h3>
            <div className="flex shrink-0 gap-1">
              <IconButton label={`Editar ${item.name}`} onClick={() => onEdit(item)}><Pencil /></IconButton>
              <IconButton label={`Eliminar ${item.name}`} onClick={() => onDelete(item)}><Trash2 /></IconButton>
            </div>
          </article>
        ))}
        {!filtered.length && (
          <div className="sm:col-span-2 xl:col-span-3">
            <EmptyState text={search ? 'No hay ingredientes que coincidan con la búsqueda.' : 'Aún no hay ingredientes. Registra insumos y luego asígnalos a las recetas.'} />
          </div>
        )}
      </div>
    </Shell>
  )
}

function SalesHistory({
  sales,
  range,
  setRange,
  onPrint,
  onPrintSale,
  isAdmin,
  onCancelSale,
}: {
  sales: Sale[]
  range: string
  setRange: (value: string) => void
  onPrint: () => void
  onPrintSale: (sale: Sale) => void
  isAdmin: boolean
  onCancelSale: (sale: Sale) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = sales.filter(sale =>
    `${sale.id} ${sale.items.map(item => item.name).join(' ')}`.toLowerCase().includes(search.toLowerCase().trim()),
  )
  return (
    <Shell
      title="Ventas"
      eyebrow="Historial de transacciones"
      action={<Button variant="outline" onClick={onPrint} className="rounded-xl"><Printer data-icon="inline-start" /> Imprimir</Button>}
    >
      <div className="mb-4 flex max-w-full gap-2 overflow-x-auto">
        {[
          ['today', 'Hoy'],
          ['week', 'Últimos 7 días'],
          ['month', 'Este mes'],
          ['all', 'Todo'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setRange(value)}
            aria-pressed={range === value}
            className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold ${
              range === value ? 'bg-[#f97316] text-white' : 'border border-[#ece8e3] bg-white text-[#746b64]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por número o plato..." />
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#ece8e3] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-[#fcfaf8] text-xs text-[#958d84]">
              <tr>{['Venta', 'Fecha y hora', 'Productos', 'Pago', 'Total', 'Estado', 'Comanda', 'Acción'].map(label => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(sale => (
                <tr key={sale.id} className="border-t border-[#f3efeb]">
                  <td className="px-5 py-4 font-semibold">#{sale.id}</td>
                  <td className="px-5 py-4 text-[#746b64]">{dateTime(sale.createdAt)}</td>
                  <td className="px-5 py-4 text-[#746b64]">
                    <p>{sale.items.map(item => `${item.quantity} × ${item.name}`).join(', ')}</p>
                    <p className="mt-1 text-xs text-[#958d84]">
                      {sale.serviceType === 'dine_in'
                        ? `Mesa ${sale.tableNumber ?? '—'} · `
                        : sale.serviceType === 'takeaway'
                          ? 'Para llevar · '
                          : ''}
                      {sale.customerName ?? ''}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-[#746b64]">{paymentName(sale.paymentMethod)}</td>
                  <td className="px-5 py-4 font-bold">{money(sale.total)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sale.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      {sale.status === 'cancelled' ? 'Anulado' : 'Completado'}
                    </span>
                    {sale.cancellationReason && <p className="mt-2 max-w-48 text-xs text-red-700">{sale.cancellationReason}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <Button variant="outline" size="sm" onClick={() => onPrintSale(sale)} aria-label={`Reimprimir comanda de la venta ${sale.id}`}>
                      <Printer data-icon="inline-start" /> Reimprimir
                    </Button>
                  </td>
                  <td className="px-5 py-4">
                    {isAdmin && sale.status === 'completed' && (
                      <Button variant="outline" size="sm" onClick={() => onCancelSale(sale)} className="text-red-700">
                        Anular
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <EmptyState text={search ? 'No hay ventas que coincidan con la búsqueda.' : 'No hay ventas en este periodo.'} />}
      </div>
      <p className="mt-3 text-xs text-[#958d84]">Se muestran hasta 500 ventas por consulta.</p>
    </Shell>
  )
}

function CashManagement({
  cash,
  history,
  historyDate,
  historyLoading,
  onHistoryDateChange,
  onOpen,
  onClose,
  onMovement,
}: {
  cash: CashData
  history: CashHistoryEntry[]
  historyDate: string
  historyLoading: boolean
  onHistoryDateChange: (date: string) => void
  onOpen: () => void
  onClose: () => void
  onMovement: () => void
}) {
  if (!cash.open || !cash.session) {
    return (
      <Shell title="Caja" eyebrow="Control diario">
        <div className="max-w-2xl rounded-3xl border border-[#ece8e3] bg-white p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f3efeb] text-[#746b64]"><Wallet /></span>
            <div>
              <h3 className="text-lg font-bold">Caja cerrada</h3>
              <p className="text-sm text-[#958d84]">Registra el fondo inicial para comenzar a vender.</p>
            </div>
          </div>
          <Button onClick={onOpen} className="mt-6 h-12 w-full rounded-xl bg-[#f97316] font-bold text-white hover:bg-[#ea580c]">Abrir caja</Button>
        </div>
        <CashHistoryPanel
          history={history}
          date={historyDate}
          loading={historyLoading}
          onDateChange={onHistoryDateChange}
        />
      </Shell>
    )
  }
  return (
    <Shell title="Caja" eyebrow="Control de efectivo">
      <div className="max-w-3xl rounded-3xl border border-[#ece8e3] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#f0ece8] pb-6">
          <div className="flex gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[#fff7f1] text-[#f97316]"><Wallet /></span>
            <div>
              <h3 className="text-lg font-bold">Caja abierta</h3>
              <p className="text-sm text-[#958d84]">Desde {cash.session.openedAt ? dateTime(cash.session.openedAt) : 'hoy'}</p>
            </div>
          </div>
          <StatusBadge active />
        </div>
        <div className="grid gap-4 py-6 sm:grid-cols-2">
          <Metric label="Fondo inicial" value={money(cash.session.openingAmount ?? 0)} />
          <Metric label="Ventas en efectivo" value={money(cash.paymentTotals?.cash ?? 0)} />
          <Metric label="Pagos digitales" value={money(cash.paymentTotals?.digital ?? 0)} />
          <Metric label="Ventas registradas" value={String(cash.salesCount ?? 0)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0ece8] pt-5 font-bold">
          <span>Efectivo esperado</span>
          <span className="text-2xl text-[#ea580c]">{money(cash.expectedAmount ?? 0)}</span>
        </div>
        {cash.movements?.length ? (
          <div className="mt-6 border-t border-[#f0ece8] pt-5">
            <h4 className="font-bold">Movimientos de caja</h4>
            <div className="mt-3 flex flex-col gap-3">
              {cash.movements.map(item => (
                <div key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-[#746b64]">{item.description} · {dateTime(item.createdAt)}</span>
                  <span className={item.type === 'withdrawal' ? 'font-semibold text-red-700' : 'font-semibold text-green-700'}>
                    {item.type === 'withdrawal' ? '−' : '+'}{money(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button variant="outline" onClick={onMovement} className="h-11 rounded-xl">Registrar entrada / salida</Button>
          <Button onClick={onClose} className="h-11 rounded-xl bg-[#f97316] font-bold text-white hover:bg-[#ea580c]">Arqueo y cierre de caja</Button>
        </div>
      </div>
      <CashHistoryPanel
        history={history}
        date={historyDate}
        loading={historyLoading}
        onDateChange={onHistoryDateChange}
      />
    </Shell>
  )
}

function CashHistoryPanel({
  history,
  date,
  loading,
  onDateChange,
}: {
  history: CashHistoryEntry[]
  date: string
  loading: boolean
  onDateChange: (date: string) => void
}) {
  return (
    <section className="mt-6 rounded-2xl border border-[#ece8e3] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Historial de cajas</h3>
          <p className="mt-1 text-sm text-[#958d84]">Sesiones abiertas en la fecha seleccionada.</p>
        </div>
        <label className="text-sm font-semibold">
          Día
          <input
            aria-label="Filtrar historial de cajas por día"
            type="date"
            value={date}
            onChange={event => {
              if (event.target.value) onDateChange(event.target.value)
            }}
            className="mt-1 block h-10 rounded-lg border border-[#ece8e3] bg-white px-3 font-normal"
          />
        </label>
      </div>
      {loading ? (
        <p role="status" className="mt-5 text-sm text-[#746b64]">Cargando historial…</p>
      ) : history.length ? (
        <div className="mt-5 flex flex-col gap-4">
          {history.map(({ session, paymentTotals, expectedAmount, salesCount, movements }) => {
            const isOpen = !session.closedAt
            const difference =
              session.countedAmount === null || session.countedAmount === undefined
                ? null
                : session.countedAmount - expectedAmount
            return (
              <article key={session.id} className="rounded-xl border border-[#f0ece8] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold">Caja #{session.id}</h4>
                    <p className="mt-1 text-sm text-[#746b64]">
                      Apertura: {session.openedAt ? dateTime(session.openedAt) : '—'}
                    </p>
                    <p className="text-sm text-[#746b64]">
                      {isOpen ? 'Aún abierta' : `Cierre: ${dateTime(session.closedAt!)}`}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isOpen ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
                    {isOpen ? 'Abierta' : 'Cerrada'}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="text-[#958d84]">Fondo inicial</span><p className="font-semibold">{money(session.openingAmount ?? 0)}</p></div>
                  <div><span className="text-[#958d84]">Ventas en efectivo</span><p className="font-semibold">{money(paymentTotals.cash)}</p></div>
                  <div><span className="text-[#958d84]">Pagos digitales</span><p className="font-semibold">{money(paymentTotals.digital)}</p></div>
                  <div><span className="text-[#958d84]">Ventas</span><p className="font-semibold">{salesCount}</p></div>
                  <div><span className="text-[#958d84]">Efectivo esperado</span><p className="font-semibold">{money(expectedAmount)}</p></div>
                  {session.countedAmount !== null && session.countedAmount !== undefined && (
                    <div><span className="text-[#958d84]">Efectivo contado</span><p className="font-semibold">{money(session.countedAmount)}</p></div>
                  )}
                  {difference !== null && (
                    <div><span className="text-[#958d84]">Diferencia</span><p className={`font-semibold ${difference === 0 ? 'text-green-700' : difference < 0 ? 'text-red-700' : 'text-amber-700'}`}>{money(difference)}</p></div>
                  )}
                </div>
                {session.note && <p className="mt-3 text-sm text-[#746b64]">Nota de cierre: {session.note}</p>}
                {movements.length > 0 && (
                  <details className="mt-4 border-t border-[#f0ece8] pt-3">
                    <summary className="cursor-pointer text-sm font-semibold">Movimientos de caja ({movements.length})</summary>
                    <div className="mt-3 flex flex-col gap-2">
                      {movements.map(movement => (
                        <div key={movement.id} className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="text-[#746b64]">{movement.description} · {dateTime(movement.createdAt)}</span>
                          <span className={movement.type === 'withdrawal' ? 'font-semibold text-red-700' : 'font-semibold text-green-700'}>
                            {movement.type === 'withdrawal' ? '−' : '+'}{money(movement.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-[#fcfaf8] p-4 text-sm text-[#746b64]">No hay cajas abiertas en esta fecha.</p>
      )}
      {history.length === 100 && !loading && (
        <p className="mt-3 text-xs text-[#958d84]">Se muestran como máximo 100 sesiones para este día.</p>
      )}
    </section>
  )
}

function Reports({
  data,
  range,
  setRange,
  date,
  setDate,
  onPrint,
}: {
  data: DashboardData | null
  range: string
  setRange: (value: string) => void
  date: string
  setDate: (value: string) => void
  onPrint: () => void
}) {
  const reportDate = (createdAt: string) =>
    new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'short',
      timeZone: 'America/La_Paz',
    }).format(new Date(createdAt))
  const reportTime = (createdAt: string) =>
    new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/La_Paz',
    }).format(new Date(createdAt))
  const reportOrders = data?.reportOrders ?? []
  const reportTotal = reportOrders.reduce((total, order) => total + order.total, 0)

  const downloadCsv = () => {
    const exportRows = [
      ['Fecha', 'Hora', 'Descripción del pedido', 'Forma de pago', 'Servicio', 'Precio'],
      ...reportOrders.map(order => [
        reportDate(order.createdAt),
        reportTime(order.createdAt),
        order.items.map(item => [
          `${item.quantity} × ${item.name}`,
          ...(item.excludedIngredients.length ? [`SIN: ${item.excludedIngredients.join(', ')}`] : []),
          ...(item.note ? [`Nota: ${item.note}`] : []),
        ].join('\n')).join('\n'),
        paymentName(order.paymentMethod),
        order.serviceType === 'dine_in' ? 'Comer aquí' : order.serviceType === 'takeaway' ? 'Para llevar' : 'Sin registrar',
        order.total.toFixed(2),
      ]),
      ['TOTAL DEL PERIODO', '', '', '', '', reportTotal.toFixed(2)],
    ]
    const csv = `\uFEFF${exportRows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `pedidos-${range}-${range === 'today' ? date : new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Shell
      title="Reportes"
      eyebrow="Análisis del negocio"
      action={
        <div className="flex flex-wrap items-end gap-3">
          {range === 'today' && (
            <label className="text-xs font-semibold text-[#746b64]">
              Día
              <input
                type="date"
                value={date}
                onChange={event => {
                  if (event.target.value) setDate(event.target.value)
                }}
                className="mt-1 block h-10 rounded-xl border border-[#ece8e3] bg-white px-3 text-sm font-normal"
              />
            </label>
          )}
          <select aria-label="Periodo del reporte" value={range} onChange={event => setRange(event.target.value)} className="h-10 rounded-xl border border-[#ece8e3] bg-white px-3 text-sm">
            <option value="today">Día</option><option value="week">Últimos 7 días</option><option value="month">Este mes</option>
          </select>
        </div>
      }
    >
      <p className="mb-3 text-sm font-semibold text-[#746b64]">
        Periodo: {range === 'today' ? date : range === 'week' ? 'Últimos 7 días' : 'Este mes'}
      </p>
      <div className="report-print-area">
        <ReportTable
          headers={['Fecha', 'Hora', 'Descripción del pedido', 'Forma de pago', 'Para comer aquí o llevar', 'Precio']}
          rows={reportOrders.map(order => [
            reportDate(order.createdAt),
            reportTime(order.createdAt),
            <div className="report-order-items" key={`order-${order.id}`}>
              {order.items.map((item, index) => (
                <div className="report-order-item" key={`${order.id}-${index}`}>
                  <div className="report-order-item-heading">
                    <strong>{item.quantity} × {item.name}</strong>
                    <strong>{money(item.total)}</strong>
                  </div>
                  {item.excludedIngredients.length > 0 && (
                    <p className="report-order-modification">SIN: {item.excludedIngredients.join(', ')}</p>
                  )}
                  {item.note && <p className="report-order-note">Nota: {item.note}</p>}
                </div>
              ))}
              {!order.items.length && <span>Sin detalle de productos</span>}
            </div>,
            paymentName(order.paymentMethod),
            order.serviceType === 'dine_in'
              ? 'Comer aquí'
              : order.serviceType === 'takeaway'
                ? 'Para llevar'
                : 'Sin registrar',
            money(order.total),
          ])}
          summary={money(reportTotal)}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" onClick={onPrint} className="rounded-xl"><Printer data-icon="inline-start" /> Exportar PDF</Button>
        <Button variant="outline" onClick={downloadCsv} className="rounded-xl"><Download data-icon="inline-start" /> Exportar para Excel (CSV)</Button>
      </div>
    </Shell>
  )
}

function ReportTable({
  headers,
  rows,
  summary,
}: {
  headers: string[]
  rows: React.ReactNode[][]
  summary?: string
}) {
  return (
    <div className="report-table-wrap mt-4 overflow-x-auto">
      <table className="report-table w-full min-w-max text-left text-sm">
        <thead>
          <tr>
            {headers.map(header => <th key={header} scope="col">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, columnIndex) => <td key={columnIndex}>{value || '—'}</td>)}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={headers.length}>Sin datos para este periodo.</td>
            </tr>
          )}
        </tbody>
        {summary !== undefined && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={headers.length - 1}>TOTAL DEL PERIODO</th>
              <th className="report-total-value">{summary}</th>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function SettingsPage({
  settings,
  user,
  onSave,
  saving,
}: {
  settings: RestaurantSettings
  user: AuthUser
  onSave: (settings: RestaurantSettings) => void
  saving: boolean
}) {
  const [values, setValues] = useState(settings)
  useEffect(() => setValues(settings), [settings])
  return (
    <Shell title="Configuración" eyebrow="Datos del restaurante">
      <form
        className="max-w-3xl rounded-2xl border border-[#ece8e3] bg-white p-6"
        onSubmit={event => {
          event.preventDefault()
          onSave(values)
        }}
      >
        <h3 className="text-lg font-bold">Información del negocio</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre del restaurante" required value={values.name} onChange={name => setValues(current => ({ ...current, name }))} />
          <FormField label="Dirección" value={values.address} onChange={address => setValues(current => ({ ...current, address }))} />
          <FormField label="Teléfono" value={values.phone} onChange={phone => setValues(current => ({ ...current, phone }))} />
          <label className="text-sm font-semibold">Moneda
            <input disabled value="Bolivianos (Bs)" className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-[#fcfaf8] px-3 font-normal text-[#746b64]" />
          </label>
        </div>
        <p className="mt-5 text-xs text-[#958d84]">El nombre y contacto se guardan en PostgreSQL y se aplican a las ventas futuras.</p>
        <Button disabled={saving} type="submit" className="mt-6 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>
      <div className="mt-6 max-w-3xl">
        <UserManagement currentUser={user} />
      </div>
    </Shell>
  )
}

function Login({ error, onLogin }: { error: string; onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState('')
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f8f7] p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-[#ece8e3] bg-white p-6 shadow-sm sm:p-8"
        onSubmit={async event => {
          event.preventDefault()
          setSubmitting(true)
          setLoginError('')
          try {
            await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
            onLogin()
          } catch (cause) {
            setLoginError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#f97316] text-white"><Store /></span>
          <div><p className="font-bold tracking-widest">RESTAURANTE</p><p className="text-xs text-[#958d84]">Punto de venta</p></div>
        </div>
        <h1 className="text-2xl font-bold">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-[#746b64]">Ingresa con tu cuenta de administrador o cajero.</p>
        {(loginError || error) && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{loginError || error}</p>}
        <label className="mt-5 block text-sm font-semibold">Correo electrónico
          <input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] px-3 font-normal" />
        </label>
        <label className="mt-4 block text-sm font-semibold">Contraseña
          <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] px-3 font-normal" />
        </label>
        <Button disabled={submitting} type="submit" className="mt-6 h-11 w-full rounded-xl bg-[#f97316] font-bold text-white hover:bg-[#ea580c]">
          {submitting ? 'Validando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  )
}

function UserManagement({ currentUser }: { currentUser: AuthUser }) {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveInProgress = useRef(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<StaffUser | null | undefined>(undefined)
  const [notice, setNotice] = useState('')

  const reloadUsers = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await api<StaffUser[]>('/api/users'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadUsers()
  }, [reloadUsers])

  async function saveUser(values: Record<string, unknown>) {
    if (saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    try {
      if (editing) {
        await api('/api/users', { method: 'PUT', body: JSON.stringify({ ...values, id: editing.id }) })
      } else {
        await api('/api/users', { method: 'POST', body: JSON.stringify(values) })
      }
      setEditing(undefined)
      setNotice(editing ? 'Cuenta actualizada.' : 'Cuenta creada.')
      void reloadUsers()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la cuenta.')
    } finally {
      saveInProgress.current = false
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[#ece8e3] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Usuarios y permisos</h3>
          <p className="mt-1 text-sm text-[#958d84]">Administradores gestionan el sistema; cajeros registran ventas y caja.</p>
        </div>
        <Button onClick={() => setEditing(null)} className="rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
          <Plus data-icon="inline-start" /> Nuevo usuario
        </Button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <div className="mt-4 divide-y divide-[#f3efeb]">
        {loading ? <p className="py-5 text-sm text-[#958d84]">Cargando usuarios…</p> : users.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="font-semibold">{item.name}{item.id === currentUser.id ? ' (tú)' : ''}</p>
              <p className="text-sm text-[#746b64]">{item.email} · {item.role === 'admin' ? 'Administrador' : 'Cajero'}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge active={item.active} />
              <IconButton label={`Editar usuario ${item.name}`} onClick={() => setEditing(item)}><Pencil /></IconButton>
            </div>
          </div>
        ))}
        {!loading && users.length === 0 && <p className="py-5 text-sm text-[#958d84]">No hay usuarios registrados.</p>}
      </div>
      {editing !== undefined && (
        <StaffForm user={editing} onClose={() => setEditing(undefined)} onSave={saveUser} saving={saving} />
      )}
    </section>
  )
}

function StaffForm({
  user,
  onClose,
  onSave,
  saving,
}: {
  user: StaffUser | null
  onClose: () => void
  onSave: (values: Record<string, unknown>) => void
  saving: boolean
}) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'cashier'>(user?.role ?? 'cashier')
  const [active, setActive] = useState(user?.active ?? true)
  return (
    <Dialog title={user ? 'Editar usuario' : 'Crear usuario'} onClose={onClose}>
      <form onSubmit={event => {
        event.preventDefault()
        onSave({ name, email, password: user && !password ? undefined : password, role, active })
      }}>
        <div className="flex flex-col gap-4">
          <FormField label="Nombre" required value={name} onChange={setName} />
          <FormField label="Correo electrónico" required type="email" value={email} onChange={setEmail} />
          <label className="block text-sm font-semibold">Rol
            <select value={role} onChange={event => setRole(event.target.value as 'admin' | 'cashier')} className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3">
              <option value="cashier">Cajero</option><option value="admin">Administrador</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            {user ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
            <input
              type="password"
              required={!user}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] px-3 font-normal"
            />
            <span className="mt-1 block text-xs font-normal text-[#958d84]">Mínimo 12 caracteres.</span>
          </label>
          {user && (
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} className="size-4 accent-[#f97316]" />
              Cuenta activa
            </label>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Cancelar</Button>
          <Button disabled={saving} type="submit" className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function Customization({
  product,
  onClose,
  onAdd,
}: {
  product: Product
  onClose: () => void
  onAdd: (excludedIngredients: string[], note: string) => void
}) {
  const [excluded, setExcluded] = useState<string[]>([])
  const [note, setNote] = useState('')
  return (
    <Dialog title={`Personalizar ${product.name}`} onClose={onClose}>
      <p className="mb-5 text-sm font-semibold text-[#ea580c]">{money(product.price)}</p>
      {product.ingredients.length ? (
        <fieldset>
          <legend className="mb-3 text-sm font-bold">Ingredientes incluidos</legend>
          <div className="grid grid-cols-2 gap-2">
            {product.ingredients.map(name => (
              <label key={name} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ece8e3] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={!excluded.includes(name)}
                  onChange={() => setExcluded(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name])}
                  className="size-4 accent-[#f97316]"
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mb-4 rounded-xl bg-[#fff7f1] p-3 text-sm text-[#8f8278]">
          Este plato aún no tiene ingredientes configurados.
        </p>
      )}
      <label className="mt-5 block text-sm font-bold">
        Observación
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          maxLength={500}
          placeholder="Ej.: preparar sin tomate..."
          className="mt-2 min-h-20 w-full rounded-xl border border-[#ece8e3] p-3 text-sm font-normal outline-none focus:border-[#f97316]"
        />
      </label>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Cancelar</Button>
        <Button onClick={() => onAdd(excluded, note.trim())} className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
          Agregar al pedido
        </Button>
      </div>
    </Dialog>
  )
}

function ProductForm({
  product,
  ingredients,
  onClose,
  onSave,
  saving,
}: {
  product: Product | null
  ingredients: Ingredient[]
  onClose: () => void
  onSave: (values: Record<string, unknown>) => void
  saving: boolean
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? 'Platos')
  const [price, setPrice] = useState(product?.price.toString() ?? '')
  const [available, setAvailable] = useState(product?.available ?? true)
  const [includedIngredientIds, setIncludedIngredientIds] = useState<number[]>(
    product?.recipe.map(line => line.ingredientId) ?? [],
  )
  return (
    <Dialog title={product ? 'Editar plato' : 'Nuevo plato'} onClose={onClose}>
      <form
        onSubmit={event => {
          event.preventDefault()
          onSave({
            name,
            category,
            price: Number(price),
            available,
            ingredientIds: includedIngredientIds,
          })
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" required value={name} onChange={setName} />
          <FormField label="Categoría" required value={category} onChange={setCategory} placeholder="Ej.: Platos, Sopas, Bebidas" />
          <FormField label="Precio (Bs)" required type="number" min="0" step="0.01" value={price} onChange={setPrice} />
          <label className="flex items-center gap-3 self-end rounded-xl bg-[#fcfaf8] p-3 text-sm font-semibold">
            <input type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)} className="size-4 accent-[#f97316]" />
            Disponible para vender
          </label>
        </div>
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-bold">Ingredientes incluidos</legend>
          <p className="mb-3 text-xs text-[#958d84]">Marca los ingredientes que lleva este plato. No se registra ni descuenta stock.</p>
          {ingredients.length ? (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-[#ece8e3]">
              {ingredients.map(item => (
                <label key={item.id} className="flex cursor-pointer items-center gap-3 border-b border-[#f3efeb] p-3 text-sm last:border-0">
                  <input
                    type="checkbox"
                    checked={includedIngredientIds.includes(item.id)}
                    onChange={() => setIncludedIngredientIds(current =>
                      current.includes(item.id)
                        ? current.filter(id => id !== item.id)
                        : [...current, item.id],
                    )}
                    className="size-4 accent-[#f97316]"
                  />
                  {item.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-[#fff7f1] p-3 text-sm text-[#8f8278]">Primero registra ingredientes para seleccionarlos en el plato.</p>
          )}
        </fieldset>
        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Cancelar</Button>
          <Button disabled={saving} type="submit" className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
            {saving ? 'Guardando…' : 'Guardar plato'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function IngredientForm({
  ingredient,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  ingredient: Ingredient | null
  onClose: () => void
  onSave: (values: Record<string, unknown>) => void
  onDelete?: (ingredient: Ingredient) => void
  saving: boolean
}) {
  const [name, setName] = useState(ingredient?.name ?? '')
  return (
    <Dialog title={ingredient ? 'Editar ingrediente' : 'Nuevo ingrediente'} onClose={onClose}>
      <form
        onSubmit={event => {
          event.preventDefault()
          onSave({ name })
        }}
      >
        <FormField label="Nombre del ingrediente" required value={name} onChange={setName} />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Cancelar</Button>
          <Button disabled={saving} type="submit" className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
            {saving ? 'Guardando…' : 'Guardar ingrediente'}
          </Button>
          {ingredient && onDelete && (
            <Button disabled={saving} type="button" variant="outline" onClick={() => onDelete(ingredient)} className="h-11 rounded-xl text-red-700">
              {saving ? 'Procesando…' : 'Eliminar'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}

function SaleConfirmation({
  total,
  serviceType,
  setServiceType,
  customerName,
  setCustomerName,
  tableNumber,
  setTableNumber,
  method,
  setMethod,
  cashReceived,
  setCashReceived,
  onCancel,
  onConfirm,
  submitting,
}: {
  total: number
  serviceType: 'takeaway' | 'dine_in'
  setServiceType: (value: 'takeaway' | 'dine_in') => void
  customerName: string
  setCustomerName: (value: string) => void
  tableNumber: string
  setTableNumber: (value: string) => void
  method: string
  setMethod: (value: string) => void
  cashReceived: string
  setCashReceived: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  const received = Number(cashReceived)
  return (
    <Dialog title="Confirmar venta" onClose={onCancel}>
      <div className="rounded-xl bg-[#fcfaf8] p-4">
        <div className="flex justify-between text-sm"><span>Total a cobrar</span><b>{money(total)}</b></div>
        <label className="mt-4 block text-sm font-semibold">
          Tipo de pedido
          <select
            value={serviceType}
            onChange={event => setServiceType(event.target.value as 'takeaway' | 'dine_in')}
            className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3"
          >
            <option value="takeaway">Para llevar</option>
            <option value="dine_in">Comer aquí</option>
          </select>
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Nombre para llamar
          <input
            required
            maxLength={120}
            autoComplete="name"
            value={customerName}
            onChange={event => setCustomerName(event.target.value)}
            placeholder="Nombre del cliente"
            className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3 font-normal"
          />
        </label>
        {serviceType === 'dine_in' && (
          <label className="mt-4 block text-sm font-semibold">
            Mesa
            <input
              required
              maxLength={30}
              value={tableNumber}
              onChange={event => setTableNumber(event.target.value)}
              placeholder="Número o nombre de mesa"
              className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3 font-normal"
            />
          </label>
        )}
        <label className="mt-4 block text-sm font-semibold">
          Método de pago
          <select value={method} onChange={event => setMethod(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3">
            <option value="cash">Efectivo</option><option value="qr">QR</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
          </select>
        </label>
        {method === 'cash' && (
          <>
            <label className="mt-4 block text-sm font-semibold">
              Efectivo recibido (Bs)
              <input
                type="number"
                min={total}
                step="0.01"
                required
                value={cashReceived}
                onChange={event => setCashReceived(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3"
              />
            </label>
            <p className={`mt-3 text-sm font-semibold ${received >= total ? 'text-green-700' : 'text-red-700'}`}>
              {received >= total ? `Cambio: ${money(received - total)}` : 'El efectivo no cubre el total.'}
            </p>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-[#958d84]">Al confirmar se guardará la venta. Los ingredientes solo se usan para personalizar el pedido, no se descuenta stock.</p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={onCancel} className="h-11 flex-1 rounded-xl">Volver al pedido</Button>
        <Button
          disabled={
            submitting ||
            !customerName.trim() ||
            (serviceType === 'dine_in' && !tableNumber.trim()) ||
            (method === 'cash' && (!Number.isFinite(received) || received < total))
          }
          onClick={onConfirm}
          className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]"
        >
          {submitting ? 'Registrando…' : 'Confirmar y cobrar'}
        </Button>
      </div>
    </Dialog>
  )
}

function CashForm({
  mode,
  cash,
  onClose,
  onSubmit,
  saving,
}: {
  mode: 'open' | 'close' | 'movement'
  cash: CashData
  onClose: () => void
  onSubmit: (values: Record<string, unknown>) => void
  saving: boolean
}) {
  const [amount, setAmount] = useState(mode === 'open' ? '0' : '')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('deposit')
  const [note, setNote] = useState('')
  const expected = cash.session?.expectedAmount ?? 0
  return (
    <Dialog
      title={mode === 'open' ? 'Abrir caja' : mode === 'close' ? 'Arqueo y cierre de caja' : 'Movimiento de caja'}
      onClose={onClose}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          if (mode === 'open') onSubmit({ action: 'open', openingAmount: Number(amount) })
          if (mode === 'movement') onSubmit({ action: 'movement', id: cash.session?.id, type, amount: Number(amount), description })
          if (mode === 'close') onSubmit({ action: 'close', id: cash.session?.id, countedAmount: Number(amount), note })
        }}
      >
        {mode === 'open' && (
          <FormField label="Fondo inicial (Bs)" required type="number" min="0" step="0.01" value={amount} onChange={setAmount} />
        )}
        {mode === 'movement' && (
          <>
            <label className="block text-sm font-semibold">Tipo de movimiento
              <select value={type} onChange={event => setType(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] bg-white px-3">
                <option value="deposit">Entrada de efectivo</option><option value="withdrawal">Salida de efectivo</option>
              </select>
            </label>
            <FormField label="Monto (Bs)" required type="number" min="0.01" step="0.01" value={amount} onChange={setAmount} />
            <FormField label="Descripción" required value={description} onChange={setDescription} placeholder="Ej.: compra de insumos" />
          </>
        )}
        {mode === 'close' && (
          <>
            <div className="mb-4 rounded-xl bg-[#fcfaf8] p-4 text-sm">
              <div className="flex justify-between"><span>Efectivo esperado</span><b>{money(expected)}</b></div>
              <div className="mt-2 flex justify-between"><span>Fondo inicial</span><span>{money(cash.session?.openingAmount ?? 0)}</span></div>
              <div className="mt-2 flex justify-between"><span>Ventas en efectivo</span><span>{money(cash.paymentTotals?.cash ?? 0)}</span></div>
            </div>
            <FormField label="Efectivo contado (Bs)" required type="number" min="0" step="0.01" value={amount} onChange={setAmount} />
            {amount !== '' && (
              <p className={`mt-3 text-sm font-semibold ${Number(amount) === expected ? 'text-green-700' : 'text-amber-700'}`}>
                Diferencia: {money(Number(amount) - expected)}
              </p>
            )}
            <label className="mt-4 block text-sm font-semibold">Nota de cierre (opcional)
              <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} className="mt-2 min-h-20 w-full rounded-xl border border-[#ece8e3] p-3 font-normal" />
            </label>
          </>
        )}
        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Cancelar</Button>
          <Button disabled={saving} type="submit" className="h-11 flex-1 rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c]">
            {saving ? 'Guardando…' : mode === 'open' ? 'Abrir caja' : mode === 'close' ? 'Confirmar cierre' : 'Guardar movimiento'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1 text-[#746b64] hover:bg-[#fcfaf8]">
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="relative block w-full max-w-lg">
      <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#aaa199]" />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-[#ece8e3] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#f97316]" />
    </label>
  )
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  min,
  step,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  min?: string
  step?: string
  placeholder?: string
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        type={type}
        required={required}
        min={min}
        step={step}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-xl border border-[#ece8e3] px-3 font-normal outline-none focus:border-[#f97316]"
      />
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#ece8e3] bg-white p-5">
      <p className="text-xs text-[#958d84]">{label}</p>
      <p className="mt-3 break-words text-2xl font-bold">{value}</p>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-green-50 text-green-700' : 'bg-[#f3efeb] text-[#746b64]'}`}>
      {active ? 'Disponible' : 'No disponible'}
    </span>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button aria-label={label} onClick={onClick} className="rounded-lg p-2 text-[#746b64] hover:bg-[#fff7f1] hover:text-[#ea580c]">
      {children}
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="p-8 text-center text-sm text-[#958d84]">{text}</p>
}

function paymentName(method: string) {
  return ({ cash: 'Efectivo', qr: 'QR', card: 'Tarjeta', transfer: 'Transferencia' } as Record<string, string>)[method] ?? method
}
