type Trade = {
  id: string
  trade_date: string
  pips: number
  note: string
  created_at?: string
  updated_at?: string
}

type Account = {
  id: string
  display_name: string
  created_at: string
}

function tradeValueClass(pips: number): string {
  const classes = ["btn btn-sm btn-link p-0 journal-trade-value"]
  if (pips > 0) classes.push("is-win")
  if (pips < 0) classes.push("is-loss")
  return classes.join(" ")
}

type Statistics = {
  totalTrades: number
  wins: number
  losses: number
  breakEven: number
  averageWin: number | null
  averageLoss: number | null
  winRate: number
  payoffRatio: number | null
  expectancy: number
  netPips: number
}

type Bucket = Statistics & { key: string }
type Analytics = { summary: Statistics; buckets: Bucket[] }

interface FullCalendarApi {
  destroy: () => void
  render: () => void
  // eslint-disable-next-line no-unused-vars
  gotoDate: (date: string | Date) => void
  getDate: () => Date
}

const state: {
  currentAccountId: string
  editingTradeId: string | null
  addingTradeDate: string | null
  weekLoadVersion: number
  reviewSaveTimer: ReturnType<typeof setTimeout> | undefined
  fullCalendarInstance: FullCalendarApi | null
} = {
  currentAccountId:
    localStorage.getItem("active_account_id") || "00000000-0000-4000-8000-000000000001",
  editingTradeId: null,
  addingTradeDate: null,
  weekLoadVersion: 0,
  reviewSaveTimer: undefined,
  fullCalendarInstance: null
}

const daysElement = document.querySelector<HTMLTableRowElement>("#calendar-days")
const selectedDate = document.querySelector<HTMLInputElement>("#selected-date")
const weekLabel = document.querySelector<HTMLElement>("#week-label")
const weekTotal = document.querySelector<HTMLElement>("#week-total")
const statusMessage = document.querySelector<HTMLElement>("#status-message")
const notesInput = document.querySelector<HTMLTextAreaElement>("#weekly-notes")
const reviewStatus = document.querySelector<HTMLElement>("#review-status")
const accountSelector = document.querySelector<HTMLSelectElement>("#account-selector")
const tradeRows = new Map<string, Trade[]>()

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function dateAtOffset(dateText: string, offset: number): string {
  const date = new Date(`${dateText}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDate(date)
}

function mondayOf(dateText: string): string {
  const date = new Date(`${dateText}T12:00:00`)
  const weekday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - weekday)
  return localDate(date)
}

function parseDateParts(dateText: string): { year: number; month: number; day: number } {
  const parts = dateText.split("-").map(Number)
  return { year: parts[0], month: parts[1], day: parts[2] }
}

function formatDate(dateText: string, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = parseDateParts(dateText)
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
}

function formatDateVN(dateText: string): string {
  const { year, month, day } = parseDateParts(dateText)
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
}

function formatDateTimeVN(isoText: string): string {
  try {
    const d = new Date(isoText)
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(d)
  } catch {
    return isoText
  }
}

function formatTimeVN(isoText?: string): string {
  if (!isoText) return ""
  try {
    const d = new Date(isoText)
    if (Number.isNaN(d.valueOf())) return ""
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d)
  } catch {
    return ""
  }
}

function formatWeekRangeVN(startDateText: string): string {
  const endDateText = dateAtOffset(startDateText, 6)
  return `${formatDateVN(startDateText)} – ${formatDateVN(endDateText)}`
}

function formatPeriodLabelVN(period: string, key: string): string {
  if (period === "week") {
    const end = dateAtOffset(key, 6)
    return `Week (${formatDateVN(key).slice(0, 5)} – ${formatDateVN(end)})`
  }
  if (period === "month") {
    const [y, m] = key.split("-")
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const monthIndex = Number(m) - 1
    const mName = monthNames[monthIndex] || m
    return `${mName} ${y}`
  }
  if (period === "quarter") {
    const [y, q] = key.split("-")
    return `${q}/${y}`
  }
  if (period === "day") {
    const { month, day } = parseDateParts(key)
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
  }
  return `Year ${key}`
}

function formatPips(value: number, signed = false): string {
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    useGrouping: false
  }).format(value)
  return signed && value > 0 ? `+${formatted}` : formatted
}

function tradePipsInput(value = ""): HTMLInputElement {
  const input = document.createElement("input")
  input.type = "text"
  input.inputMode = "decimal"
  input.maxLength = 20
  input.autocomplete = "off"
  input.className = "form-control form-control-sm"
  input.setAttribute("aria-label", "Trade result in Pips")
  input.placeholder = "+2.5 or -10"
  input.value = value
  return input
}

function makeButton(
  label: string,
  action: string,
  className: string,
  title: string
): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = className
  button.dataset.action = action
  button.setAttribute("aria-label", label)
  button.title = title
  button.textContent = label
  return button
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": state.currentAccountId,
      ...options?.headers
    }
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // Keep HTTP status
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function summarize(trades: Trade[]): Statistics {
  const wins = trades.filter((trade) => trade.pips > 0)
  const losses = trades.filter((trade) => trade.pips < 0)
  const totalTrades = trades.length
  let winningPips = 0
  let losingPips = 0
  let netPips = 0
  for (const trade of trades) {
    netPips += trade.pips
    if (trade.pips > 0) winningPips += trade.pips
    if (trade.pips < 0) losingPips += Math.abs(trade.pips)
  }
  const averageWin = wins.length > 0 ? winningPips / wins.length : null
  const averageLoss = losses.length > 0 ? losingPips / losses.length : null
  const winRate = totalTrades > 0 ? wins.length / totalTrades : 0
  const lossRate = totalTrades > 0 ? losses.length / totalTrades : 0

  return {
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    breakEven: totalTrades - wins.length - losses.length,
    averageWin,
    averageLoss,
    winRate,
    payoffRatio: averageWin !== null && averageLoss ? averageWin / averageLoss : null,
    expectancy: winRate * (averageWin ?? 0) - lossRate * (averageLoss ?? 0),
    netPips
  }
}

function renderStats(stats: Statistics): void {
  const values: Record<string, string> = {
    totalTrades: String(stats.totalTrades),
    wins: String(stats.wins),
    losses: String(stats.losses),
    breakEven: String(stats.breakEven),
    averageWin: formatOptionalPips(stats.averageWin),
    averageLoss: formatOptionalPips(stats.averageLoss),
    winRate: `${(stats.winRate * 100).toFixed(2)}%`,
    payoffRatio: stats.payoffRatio === null ? "—" : stats.payoffRatio.toFixed(2),
    expectancy: formatPips(stats.expectancy),
    netPips: formatPips(stats.netPips, true)
  }
  for (const [key, value] of Object.entries(values)) {
    const target = document.querySelector<HTMLElement>(`[data-stat="${key}"]`)
    if (target) target.textContent = value
  }

  // Update Win Rate Progress Bar in Simple Table
  const progressBar = document.querySelector<HTMLElement>("#winrate-progress-bar")
  if (progressBar) {
    const ratePercent = Math.min(100, Math.max(0, stats.winRate * 100)).toFixed(1)
    progressBar.style.width = `${ratePercent}%`
    progressBar.className = `progress-bar ${stats.winRate >= 0.5 ? "bg-success" : (stats.winRate >= 0.35 ? "bg-warning" : "bg-danger")}`
  }

  const netValue = document.querySelector<HTMLElement>('[data-stat="netPips"]')
  netValue?.classList.toggle("journal-positive", stats.netPips > 0)
  netValue?.classList.toggle("journal-negative", stats.netPips < 0)
}

function formatOptionalPips(value: number | null): string {
  return value === null ? "—" : formatPips(value)
}

function renderDay(date: string, weekday: number): HTMLTableCellElement {
  const trades = tradeRows.get(date) ?? []
  const cell = document.createElement("td")
  const panel = document.createElement("div")
  panel.className = `journal-day rounded p-2${date === localDate(new Date()) ? " is-today" : ""}`

  const heading = document.createElement("div")
  heading.className = "journal-day-heading d-flex flex-column justify-content-center mb-2"
  const dateTitle = document.createElement("strong")
  dateTitle.textContent = formatDate(date, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  })
  const total = trades.reduce((sum, trade) => sum + trade.pips, 0)
  const dailyTotal = document.createElement("span")
  dailyTotal.className = "journal-day-total"
  if (total > 0) dailyTotal.classList.add("journal-positive")
  if (total < 0) dailyTotal.classList.add("journal-negative")
  dailyTotal.textContent = formatPips(total, true)
  heading.append(dateTitle, dailyTotal)

  const list = document.createElement("div")
  list.className = "journal-trades"
  for (const trade of trades) {
    const row = document.createElement("div")
    row.className = "journal-trade"
    if (state.editingTradeId === trade.id) {
      const input = tradePipsInput(String(trade.pips))
      input.dataset.tradeInput = trade.id
      const saveBtn = makeButton("Lưu", "save-edit", "btn btn-sm btn-success", "Lưu lệnh")
      saveBtn.dataset.tradeId = trade.id
      const cancelBtn = makeButton("×", "cancel-edit", "btn btn-sm btn-outline-secondary", "Hủy sửa")
      cancelBtn.dataset.tradeId = trade.id
      row.append(input, saveBtn, cancelBtn)
    } else {
      const value = makeButton(
        formatPips(trade.pips, true),
        "edit-trade",
        tradeValueClass(trade.pips),
        "Sửa lệnh này"
      )
      value.dataset.tradeId = trade.id
      const timeText = formatTimeVN(trade.created_at)
      const timeSpan = document.createElement("span")
      timeSpan.className = "text-body-secondary small ms-auto me-1 font-monospace"
      timeSpan.style.fontSize = "0.75rem"
      timeSpan.textContent = timeText

      row.append(
        value,
        timeSpan,
        makeButton(
          "×",
          "delete-trade",
          "btn btn-sm btn-link text-body-secondary p-0",
          "Xóa lệnh"
        )
      )
      const deleteButton = row.lastElementChild as HTMLButtonElement
      deleteButton.dataset.tradeId = trade.id
    }
    list.append(row)
  }

  if (state.addingTradeDate === date) {
    const addRow = document.createElement("div")
    addRow.className = "journal-trade"
    const input = tradePipsInput()
    input.dataset.newTradeDate = date
    addRow.append(
      input,
      makeButton("Lưu", "save-add", "btn btn-sm btn-success", "Lưu lệnh"),
      makeButton("×", "cancel-add", "btn btn-sm btn-outline-secondary", "Hủy thêm")
    )
    list.append(addRow)
  }

  const addButton = makeButton(
    "+",
    "add-trade",
    "btn btn-sm btn-outline-primary mt-2",
    `Thêm lệnh ngày ${formatDateVN(date)}`
  )
  addButton.dataset.tradeDate = date
  addButton.setAttribute("aria-label", `Thêm lệnh ngày ${formatDateVN(date)}`)
  panel.append(heading, list, addButton)
  cell.append(panel)
  cell.dataset.weekday = String(weekday)
  return cell
}

function renderCalendar(start: string): void {
  if (!daysElement) return
  const weekTrades = Array.from(tradeRows.values()).flat()
  daysElement.replaceChildren(
    ...Array.from({ length: 7 }, (_, day) => renderDay(dateAtOffset(start, day), day))
  )
  if (weekLabel) {
    weekLabel.textContent = formatWeekRangeVN(start)
  }
  const stats = summarize(weekTrades)
  if (weekTotal) {
    weekTotal.textContent = formatPips(stats.netPips, true)
    weekTotal.classList.toggle("journal-positive", stats.netPips > 0)
    weekTotal.classList.toggle("journal-negative", stats.netPips < 0)
  }
  renderStats(stats)
}

function setStatus(message: string, isError = false): void {
  if (!statusMessage) return
  statusMessage.textContent = message
  if (!message) {
    statusMessage.className = "journal-status small d-none"
    return
  }
  statusMessage.className = `journal-status small ${isError ? "text-danger fw-semibold" : "text-success fw-semibold"}`
}

async function loadWeek(date: string): Promise<void> {
  if (selectedDate) selectedDate.value = date
  const start = mondayOf(date)
  const end = dateAtOffset(start, 6)
  const loadVersion = ++state.weekLoadVersion
  try {
    const [trades, review] = await Promise.all([
      api<Trade[]>(`/api/trades?from=${start}&to=${end}`),
      api<{ notes: string }>(`/api/reviews/${start}`)
    ])
    if (loadVersion !== state.weekLoadVersion) return
    tradeRows.clear()
    for (let day = 0; day < 7; day += 1) {
      tradeRows.set(dateAtOffset(start, day), [])
    }
    for (const trade of trades) {
      const list = tradeRows.get(trade.trade_date)
      if (list) list.push(trade)
    }
    renderCalendar(start)
    if (notesInput) notesInput.value = review.notes ?? ""
    if (reviewStatus) reviewStatus.textContent = ""
    setStatus("")
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to load this week.", true)
    renderCalendar(start)
  }
}

function parsePips(value: string): number | null {
  const normalized = value.trim().replace(",", ".")
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const decimals = normalized.split(".")[1]?.length ?? 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && decimals <= 4 && Math.abs(parsed) < 100000000 ? parsed : null
}

function currentTrades(): Trade[] {
  return Array.from(tradeRows.values()).flat()
}

async function saveNewTrade(date: string, input: HTMLInputElement): Promise<void> {
  const pips = parsePips(input.value)
  if (pips === null) {
    setStatus("Enter a valid Pips number (e.g. +2.5, -10, 3.8). Max 4 decimals.", true)
    input.focus()
    return
  }
  try {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const seconds = String(now.getSeconds()).padStart(2, "0")
    const createdAt = `${date}T${hours}:${minutes}:${seconds}`

    const trade = await api<Trade>("/api/trades", {
      method: "POST",
      body: JSON.stringify({
        trade_date: date,
        pips,
        note: "",
        created_at: createdAt
      })
    })
    tradeRows.get(date)?.push(trade)
    state.addingTradeDate = null
    renderCalendar(mondayOf(date))
    setStatus(`Successfully saved trade ${formatPips(trade.pips, true)} Pips (${hours}:${minutes}).`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to save trade.", true)
  }
}

async function updateTrade(id: string, input: HTMLInputElement): Promise<void> {
  const pips = parsePips(input.value)
  const trade = currentTrades().find((item) => item.id === id)
  if (pips === null || !trade) {
    setStatus("Enter a valid Pips number (e.g. +2.5, -10, 3.8).", true)
    input.focus()
    return
  }
  try {
    const updated = await api<Trade>(`/api/trades/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        trade_date: trade.trade_date,
        pips,
        note: trade.note,
        created_at: trade.created_at
      })
    })
    const rows = tradeRows.get(trade.trade_date) ?? []
    tradeRows.set(
      trade.trade_date,
      rows.map((item) => (item.id === id ? updated : item))
    )
    state.editingTradeId = null
    if (selectedDate) renderCalendar(mondayOf(selectedDate.value))
    setStatus(`Successfully updated trade to ${formatPips(updated.pips, true)} Pips.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to update trade.", true)
  }
}

function dateRange(period: string, selected: string): { from: string; to: string } {
  if (period === "week") {
    const from = mondayOf(selected)
    return { from, to: dateAtOffset(from, 6) }
  }
  const date = new Date(`${selected}T12:00:00`)
  const year = date.getFullYear()
  if (period === "month") {
    const month = date.getMonth()
    return {
      from: localDate(new Date(year, month, 1)),
      to: localDate(new Date(year, month + 1, 0))
    }
  }
  if (period === "quarter") {
    const month = Math.floor(date.getMonth() / 3) * 3
    return {
      from: localDate(new Date(year, month, 1)),
      to: localDate(new Date(year, month + 3, 0))
    }
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

// Render AdminLTE Small Box widgets
function renderSummaryCards(stats: Statistics): void {
  const target = document.querySelector<HTMLElement>("#dashboard-summary")!
  const cards: Array<{
    title: string
    value: string
    color: string
    icon: string
  }> = [
    {
      title: "Total Net Pips",
      value: formatPips(stats.netPips, true),
      color: stats.netPips >= 0 ? "text-bg-success" : "text-bg-danger",
      icon: "bi-graph-up-arrow"
    },
    {
      title: "Total Trades",
      value: String(stats.totalTrades),
      color: "text-bg-info",
      icon: "bi-activity"
    },
    {
      title: "Win Rate",
      value: `${(stats.winRate * 100).toFixed(1)}%`,
      color: stats.winRate >= 0.5 ? "text-bg-primary" : "text-bg-warning",
      icon: "bi-pie-chart"
    },
    {
      title: "Avg Win / Loss",
      value: `${stats.averageWin === null ? "0" : formatPips(stats.averageWin)} / ${stats.averageLoss === null ? "0" : formatPips(stats.averageLoss)}`,
      color: "text-bg-secondary",
      icon: "bi-arrow-left-right"
    },
    {
      title: "Payoff Ratio (R:R)",
      value: stats.payoffRatio === null ? "—" : stats.payoffRatio.toFixed(2),
      color: "text-bg-dark",
      icon: "bi-award"
    },
    {
      title: "Expectancy (Pips)",
      value: formatPips(stats.expectancy),
      color: stats.expectancy >= 0 ? "text-bg-success" : "text-bg-danger",
      icon: "bi-bullseye"
    }
  ]

  target.replaceChildren(
    ...cards.map((c) => {
      const col = document.createElement("div")
      col.className = "col-12 col-sm-6 col-lg-4 col-xxl-2"
      col.innerHTML = `
        <div class="small-box ${c.color} shadow-sm rounded-3">
          <div class="inner p-3 py-3">
            <h3 class="fs-2 fw-bold mb-1">${c.value}</h3>
            <p class="mb-0 fw-semibold text-white-75">${c.title}</p>
          </div>
          <i class="small-box-icon bi ${c.icon}"></i>
        </div>
      `
      return col
    })
  )

  // Efficiency breakdown rows (Simple Table)
  const effRows = document.querySelector("#dashboard-efficiency-rows")
  if (effRows) {
    const ratingBadge = (val: boolean, good = "Good", normal = "Needs Improvement") =>
      `<span class="badge ${val ? "text-bg-success" : "text-bg-warning"}">${val ? good : normal}</span>`
    effRows.innerHTML = `
      <tr>
        <td>Win Rate</td>
        <td class="fw-bold">${(stats.winRate * 100).toFixed(1)}%</td>
        <td>${ratingBadge(stats.winRate >= 0.5, "Benchmark Met", "Below Benchmark")}</td>
      </tr>
      <tr>
        <td>Payoff Ratio (R:R)</td>
        <td class="fw-bold">${stats.payoffRatio ? stats.payoffRatio.toFixed(2) : "—"}</td>
        <td>${ratingBadge(Number(stats.payoffRatio ?? 0) >= 1.5, "Strong", "Moderate")}</td>
      </tr>
      <tr>
        <td>Expectancy (Per Trade)</td>
        <td class="fw-bold">${formatPips(stats.expectancy)} Pips</td>
        <td>${ratingBadge(stats.expectancy > 0, "Positive Edge", "Negative")}</td>
      </tr>
    `
  }
}

function renderChart(
  svg: SVGSVGElement,
  buckets: Bucket[],
  cumulative: boolean,
  periodType = ""
): void {
  const width = Math.max(760, buckets.length * 45)
  const height = 180
  const padding = { top: 15, right: 20, bottom: 30, left: 45 }
  const plotHeight = height - padding.top - padding.bottom
  const plotWidth = width - padding.left - padding.right
  let min = 0
  let max = 0
  let running = 0
  const totals = buckets.map((bucket) => {
    running += bucket.netPips
    const value = cumulative ? running : bucket.netPips
    if (value < min) min = value
    if (value > max) max = value
    return value
  })
  if (min === max) {
    min -= 10
    max += 10
  }
  const span = max - min
  const yZero = padding.top + ((max - 0) / span) * plotHeight
  const barWidth = Math.max(16, Math.min(36, (plotWidth / Math.max(1, buckets.length)) * 0.6))
  const step = plotWidth / Math.max(1, buckets.length)

  const shapes: SVGElement[] = []
  const baseLine = document.createElementNS("http://www.w3.org/2000/svg", "line")
  baseLine.setAttribute("x1", String(padding.left))
  baseLine.setAttribute("x2", String(width - padding.right))
  baseLine.setAttribute("y1", String(yZero))
  baseLine.setAttribute("y2", String(yZero))
  baseLine.setAttribute("stroke", "var(--bs-border-color)")
  baseLine.setAttribute("stroke-dasharray", "3 3")
  shapes.push(baseLine)

  const points: string[] = []
  buckets.forEach((bucket, index) => {
    const value = totals[index]
    const x = padding.left + index * step + step / 2
    const y = padding.top + ((max - value) / span) * plotHeight
    points.push(`${x},${y}`)

    const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    const barTop = Math.min(y, yZero)
    const barHeight = Math.max(3, Math.abs(y - yZero))
    bar.setAttribute("x", String(x - barWidth / 2))
    bar.setAttribute("y", String(barTop))
    bar.setAttribute("width", String(barWidth))
    bar.setAttribute("height", String(barHeight))
    bar.setAttribute("rx", "3")
    bar.setAttribute("fill", value >= 0 ? "#198754" : "#dc3545")
    bar.setAttribute("opacity", "0.85")

    let labelText = bucket.key
    if (periodType === "day" || (bucket.key.length === 10 && periodType !== "week")) {
      const { day, month } = parseDateParts(bucket.key)
      const dayName = formatDate(bucket.key, { weekday: "short" })
      labelText = `${dayName} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
    } else if (periodType === "week" || (bucket.key.length === 10 && periodType === "week")) {
      const { day, month } = parseDateParts(bucket.key)
      labelText = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
    } else if (periodType === "month" || bucket.key.length === 7) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const mIdx = Number(bucket.key.slice(5)) - 1
      labelText = monthNames[mIdx] || bucket.key.slice(5)
    } else if (periodType === "quarter" || bucket.key.length > 10) {
      labelText = bucket.key.slice(5)
    }

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title")
    titleEl.textContent = `${labelText}: ${formatPips(value, true)} Pips (${bucket.totalTrades} trades)`
    bar.append(titleEl)
    shapes.push(bar)

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text")
    label.setAttribute("x", String(x))
    label.setAttribute("y", String(height - 12))
    label.setAttribute("text-anchor", "middle")
    label.setAttribute("font-size", "11")
    label.setAttribute("fill", "currentColor")
    label.textContent = labelText
    shapes.push(label)
  })

  if (cumulative && points.length) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
    line.setAttribute("points", points.join(" "))
    line.setAttribute("fill", "none")
    line.setAttribute("stroke", "#0d6efd")
    line.setAttribute("stroke-width", "3")
    shapes.push(line)
  }

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.replaceChildren(...shapes)
}

function renderDashboardAreaChart(
  svg: SVGSVGElement,
  buckets: Bucket[],
  periodType = ""
): void {
  const width = Math.max(760, buckets.length * 60)
  const height = 180
  const padding = { top: 25, right: 30, bottom: 35, left: 50 }
  const plotHeight = height - padding.top - padding.bottom
  const plotWidth = width - padding.left - padding.right

  if (buckets.length === 0) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
    svg.replaceChildren()
    return
  }

  // Calculate cumulative net pips for growth curve
  let running = 0
  const cumulativeValues = buckets.map((b) => {
    running += b.netPips
    return running
  })

  let min = Math.min(0, ...cumulativeValues)
  let max = Math.max(0, ...cumulativeValues)
  if (min === max) {
    min -= 10
    max += 10
  }
  const margin = Math.max(5, (max - min) * 0.12)
  min -= margin
  max += margin
  const span = max - min
  const yZero = padding.top + ((max - 0) / span) * plotHeight
  const step = plotWidth / Math.max(1, buckets.length - 1 || 1)

  const shapes: SVGElement[] = []

  const gradId = `dash-area-grad-${Math.random().toString(36).slice(2, 7)}`
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs")
  const isNetPositive = running >= 0
  const strokeColor = isNetPositive ? "#198754" : "#dc3545"

  defs.innerHTML = `
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.32" />
      <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.02" />
    </linearGradient>
  `
  shapes.push(defs)

  // Zero baseline
  const baseLine = document.createElementNS("http://www.w3.org/2000/svg", "line")
  baseLine.setAttribute("x1", String(padding.left))
  baseLine.setAttribute("x2", String(width - padding.right))
  baseLine.setAttribute("y1", String(yZero))
  baseLine.setAttribute("y2", String(yZero))
  baseLine.setAttribute("stroke", "var(--bs-border-color)")
  baseLine.setAttribute("stroke-dasharray", "3 3")
  shapes.push(baseLine)

  // Zero label on Y-axis
  const zeroLabel = document.createElementNS("http://www.w3.org/2000/svg", "text")
  zeroLabel.setAttribute("x", String(padding.left - 8))
  zeroLabel.setAttribute("y", String(yZero + 4))
  zeroLabel.setAttribute("text-anchor", "end")
  zeroLabel.setAttribute("font-size", "10")
  zeroLabel.setAttribute("fill", "var(--bs-secondary-color)")
  zeroLabel.textContent = "0"
  shapes.push(zeroLabel)

  // Compute points
  const points: Array<{ x: number; y: number; val: number; bucket: Bucket; label: string }> = []
  buckets.forEach((bucket, index) => {
    const val = cumulativeValues[index]
    const x = buckets.length === 1 ? padding.left + plotWidth / 2 : padding.left + index * step
    const y = padding.top + ((max - val) / span) * plotHeight

    let labelText = bucket.key
    switch (periodType) {
      case "day": {
        const { day, month } = parseDateParts(bucket.key)
        const dayName = formatDate(bucket.key, { weekday: "short" })
        labelText = `${dayName} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
        break
      }
      case "week": {
        const { day, month } = parseDateParts(bucket.key)
        const endDay = dateAtOffset(bucket.key, 6)
        const { day: ed, month: em } = parseDateParts(endDay)
        labelText = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}–${String(ed).padStart(2, "0")}/${String(em).padStart(2, "0")}`
        break
      }
      case "month": {
        const [, m] = bucket.key.split("-")
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        const mIdx = Number(m) - 1
        labelText = monthNames[mIdx] || m
        break
      }
      default: {
        break
      }
    }
    points.push({ x, y, val, bucket, label: labelText })
  })

  // Area Path
  if (points.length >= 2) {
    const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const lastX = points.at(-1)?.x ?? points[0].x
    const dArea = [
      `M ${points[0].x} ${yZero}`,
      ...points.map((p) => `L ${p.x} ${p.y}`),
      `L ${lastX} ${yZero}`,
      "Z"
    ].join(" ")
    areaPath.setAttribute("d", dArea)
    areaPath.setAttribute("fill", `url(#${gradId})`)
    shapes.push(areaPath)
  }

  // Line Path
  if (points.length >= 1) {
    const linePath = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const dLine = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    linePath.setAttribute("d", dLine)
    linePath.setAttribute("fill", "none")
    linePath.setAttribute("stroke", strokeColor)
    linePath.setAttribute("stroke-width", "3")
    linePath.setAttribute("stroke-linecap", "round")
    linePath.setAttribute("stroke-linejoin", "round")
    shapes.push(linePath)
  }

  // Dots, Value Labels, and X Labels
  points.forEach((p) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    circle.setAttribute("cx", String(p.x))
    circle.setAttribute("cy", String(p.y))
    circle.setAttribute("r", "4.5")
    circle.setAttribute("fill", "#fff")
    circle.setAttribute("stroke", strokeColor)
    circle.setAttribute("stroke-width", "2.5")

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title")
    titleEl.textContent = `${p.label}\nPeriod Net: ${formatPips(p.bucket.netPips, true)} Pips\nCumulative: ${formatPips(p.val, true)} Pips\nTrades: ${p.bucket.totalTrades}`
    circle.append(titleEl)
    shapes.push(circle)

    const valText = document.createElementNS("http://www.w3.org/2000/svg", "text")
    valText.setAttribute("x", String(p.x))
    valText.setAttribute("y", String(p.y - 8))
    valText.setAttribute("text-anchor", "middle")
    valText.setAttribute("font-size", "10")
    valText.setAttribute("font-weight", "600")
    valText.setAttribute("fill", p.val >= 0 ? "#198754" : "#dc3545")
    valText.textContent = formatPips(p.val, true)
    shapes.push(valText)

    const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text")
    xLabel.setAttribute("x", String(p.x))
    xLabel.setAttribute("y", String(height - 12))
    xLabel.setAttribute("text-anchor", "middle")
    xLabel.setAttribute("font-size", "11")
    xLabel.setAttribute("fill", "currentColor")
    xLabel.textContent = p.label
    shapes.push(xLabel)
  })

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.replaceChildren(...shapes)
}

async function loadDashboard(): Promise<void> {
  const period = document.querySelector<HTMLSelectElement>("#dashboard-period")!.value
  const selected = document.querySelector<HTMLInputElement>("#dashboard-date")!.value
  const range = dateRange(period, selected)

  let groupUnit: string
  switch (period) {
    case "week": {
      groupUnit = "day"
      break
    }
    case "month":
    case "quarter": {
      groupUnit = "week"
      break
    }
    case "year": {
      groupUnit = "month"
      break
    }
    default: {
      groupUnit = "day"
      break
    }
  }

  try {
    const todayStr = localDate(new Date())
    let queryTo = range.to
    if (queryTo > todayStr) queryTo = todayStr
    const result = await api<Analytics>(
      `/api/analytics?from=${range.from}&to=${queryTo}&group=${groupUnit}`
    )
    renderSummaryCards(result.summary)
    const chart = document.querySelector<SVGSVGElement>("#dashboard-chart")!

    // Filter buckets: only keep dates up to today or dates that have actual trades
    const realBuckets = result.buckets.filter((b) => b.key <= todayStr || b.totalTrades > 0)
    renderDashboardAreaChart(chart, realBuckets, groupUnit)
    const currentYear = new Date(selected).getFullYear() || new Date().getFullYear()
    await loadWeeklyComparison(currentYear)
    setStatus("")
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to load dashboard.", true)
  }
}

interface ReportState {
  buckets: Bucket[]
  currentPage: number
  pageSize: number
  period: string
  activePeriodKey: string | null
}

const reportState: ReportState = {
  buckets: [],
  currentPage: 1,
  pageSize: 10,
  period: "week",
  activePeriodKey: null
}

async function loadReportChart(period: string, periodKey?: string): Promise<void> {
  const chart = document.querySelector<SVGSVGElement>("#report-chart")
  if (!chart) return
  const titleEl = document.querySelector("#report-chart-title")
  const subtitleEl = document.querySelector("#report-chart-subtitle")
  const yearInput = document.querySelector<HTMLInputElement>("#report-year")
  const currentYear = Number(yearInput?.value) || new Date().getFullYear()

  if (period === "week") {
    // 7 days of the selected week
    let weekKey = periodKey || reportState.activePeriodKey
    if (!weekKey) {
      weekKey = reportState.buckets.find((b) => b.totalTrades > 0)?.key || reportState.buckets[0]?.key || mondayOf(localDate(new Date()))
    }
    reportState.activePeriodKey = weekKey
    const weekStart = weekKey
    const endDay = dateAtOffset(weekStart, 6)

    try {
      const daily = await api<Analytics>(`/api/analytics?from=${weekStart}&to=${endDay}&group=day`)
      renderChart(chart, daily.buckets, false, "day")
      const netText = `${formatPips(daily.summary.netPips, true)} Pips`
      const activeText = `${formatWeekRangeVN(weekStart)} (Net: ${netText})`
      if (titleEl) titleEl.textContent = `7-Day Weekly Chart`
      if (subtitleEl) subtitleEl.textContent = activeText
      const activeInfo = document.querySelector("#report-active-info")
      if (activeInfo) activeInfo.textContent = activeText
    } catch (error) {
      console.error("Error loading weekly chart:", error)
    }
    return
  }

  if (period === "month") {
    // 4-5 weeks of the month
    let monthKey = periodKey || reportState.activePeriodKey
    if (!monthKey) {
      const nowMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
      monthKey = reportState.buckets.find((b) => b.totalTrades > 0)?.key || reportState.buckets[0]?.key || nowMonth
    }
    reportState.activePeriodKey = monthKey
    const [y, m] = monthKey.split("-").map(Number)
    const monthStart = localDate(new Date(y, m - 1, 1))
    const monthEnd = localDate(new Date(y, m, 0))

    try {
      const monthWeeks = await api<Analytics>(`/api/analytics?from=${monthStart}&to=${monthEnd}&group=week`)
      renderChart(chart, monthWeeks.buckets, false, "week")
      const netText = `${formatPips(monthWeeks.summary.netPips, true)} Pips`
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
      const mName = monthNames[m - 1] || `Month ${m}`
      const activeText = `${mName} ${y} (Net: ${netText})`
      if (titleEl) titleEl.textContent = `Weekly Breakdown Chart`
      if (subtitleEl) subtitleEl.textContent = activeText
      const activeInfo = document.querySelector("#report-active-info")
      if (activeInfo) activeInfo.textContent = activeText
    } catch (error) {
      console.error("Error loading monthly chart:", error)
    }
    return
  }

  if (period === "year") {
    // 12 months of the year
    try {
      const yearMonths = await api<Analytics>(`/api/analytics?from=${currentYear}-01-01&to=${currentYear}-12-31&group=month`)
      renderChart(chart, yearMonths.buckets, false, "month")
      const netText = `${formatPips(yearMonths.summary.netPips, true)} Pips`
      const activeText = `Year ${currentYear} (Net: ${netText})`
      if (titleEl) titleEl.textContent = `12-Month Annual Chart`
      if (subtitleEl) subtitleEl.textContent = activeText
      const activeInfo = document.querySelector("#report-active-info")
      if (activeInfo) activeInfo.textContent = activeText
    } catch (error) {
      console.error("Error loading annual chart:", error)
    }
    return
  }

  // Fallback (e.g. quarter)
  renderChart(chart, reportState.buckets, false, period)
  if (titleEl) titleEl.textContent = `${period.toUpperCase()} Performance Chart`
  if (subtitleEl) subtitleEl.textContent = `Năm ${currentYear}`
}

function renderReportPageBtn(p: number, isActive = false): string {
  return `
    <li class="page-item ${isActive ? "active" : ""}">
      <button class="page-link" type="button" data-page="${p}">${p}</button>
    </li>
  `
}

function renderReportEllipsisBtn(targetPage: number): string {
  return `
    <li class="page-item">
      <button class="page-link" type="button" data-page="${targetPage}" title="Trang ${targetPage}">...</button>
    </li>
  `
}

function renderReportTable(): void {
  const rows = document.querySelector<HTMLTableSectionElement>("#report-rows")
  if (!rows) return
  const totalItems = reportState.buckets.length
  const totalPages = Math.max(1, Math.ceil(totalItems / reportState.pageSize))
  if (reportState.currentPage > totalPages) reportState.currentPage = totalPages

  const startIdx = (reportState.currentPage - 1) * reportState.pageSize
  const endIdx = Math.min(startIdx + reportState.pageSize, totalItems)
  const pageBuckets = reportState.buckets.slice(startIdx, endIdx)

  rows.replaceChildren(
    ...pageBuckets.map((bucket) => {
      const row = document.createElement("tr")
      const ratePercent = Math.min(100, Math.max(0, bucket.winRate * 100)).toFixed(1)
      let progressClass = "bg-danger"
      if (bucket.winRate >= 0.5) {
        progressClass = "bg-success"
      } else if (bucket.winRate >= 0.35) {
        progressClass = "bg-warning"
      }

      const periodLabel = formatPeriodLabelVN(reportState.period, bucket.key)
      const isActiveChart = bucket.key === reportState.activePeriodKey

      let openWeekButton = ""
      if (reportState.period === "week") {
        openWeekButton = `<button
          type="button"
          class="btn btn-sm btn-outline-secondary ms-1"
          data-action="view-history"
          data-period-date="${bucket.key}"
          title="Open trade entry table for this week"
        >
          <i class="bi bi-calendar3 me-1"></i> Open Week
        </button>`
      }

      const actionButtons = `
        <button
          type="button"
          class="btn btn-sm ${isActiveChart ? "btn-primary" : "btn-outline-primary"}"
          data-action="view-chart"
          data-period-key="${bucket.key}"
          title="View detailed breakdown chart for this period"
        >
          <i class="bi bi-bar-chart me-1"></i> Chart
        </button>
        ${openWeekButton}
      `

      row.innerHTML = `
        <td class="fw-bold ${isActiveChart ? "table-primary text-primary" : ""}">${periodLabel}</td>
        <td><span class="badge text-bg-light border">${bucket.totalTrades}</span></td>
        <td>
          <span class="text-success fw-bold">${bucket.wins}</span> / 
          <span class="text-danger fw-bold">${bucket.losses}</span>
        </td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="progress progress-xs flex-grow-1">
              <div class="progress-bar ${progressClass}" style="width: ${ratePercent}%"></div>
            </div>
            <small class="fw-semibold">${ratePercent}%</small>
          </div>
        </td>
        <td>${formatPips(bucket.expectancy)}</td>
        <td class="fw-bold ${bucket.netPips >= 0 ? "text-success" : "text-danger"}">
          ${formatPips(bucket.netPips, true)}
        </td>
        <td>${actionButtons}</td>
      `
      return row
    })
  )

  let unitName = "periods"
  if (reportState.period === "week") {
    unitName = "weeks"
  } else if (reportState.period === "month") {
    unitName = "months"
  }

  const totalBadge = document.querySelector("#report-total-badge")
  if (totalBadge) totalBadge.textContent = `${totalItems} ${unitName}`

  const info = document.querySelector("#report-pagination-info")
  if (info) {
    if (totalItems === 0) {
      info.textContent = "Không có dữ liệu trong năm này."
    } else {
      info.textContent = `Hiển thị ${startIdx + 1} – ${endIdx} trên tổng số ${totalItems} ${unitName}`
    }
  }

  const pagination = document.querySelector("#report-pagination")
  if (!pagination) return
  if (totalPages <= 1) {
    pagination.replaceChildren()
    return
  }

  const prevItem = `
    <li class="page-item ${reportState.currentPage === 1 ? "disabled" : ""}">
      <button class="page-link" type="button" data-page="${reportState.currentPage - 1}" aria-label="Trang trước">«</button>
    </li>
  `

  const nextItem = `
    <li class="page-item ${reportState.currentPage === totalPages ? "disabled" : ""}">
      <button class="page-link" type="button" data-page="${reportState.currentPage + 1}" aria-label="Trang sau">»</button>
    </li>
  `

  let middleHtml = ""
  if (totalPages <= 3) {
    for (let p = 1; p <= totalPages; p += 1) {
      middleHtml += renderReportPageBtn(p, p === reportState.currentPage)
    }
  } else if (reportState.currentPage <= 2) {
    middleHtml += renderReportPageBtn(1, reportState.currentPage === 1)
    middleHtml += renderReportPageBtn(2, reportState.currentPage === 2)
    middleHtml += renderReportEllipsisBtn(Math.min(totalPages, 3))
    middleHtml += renderReportPageBtn(totalPages, reportState.currentPage === totalPages)
  } else if (reportState.currentPage >= totalPages - 1) {
    middleHtml += renderReportPageBtn(1, reportState.currentPage === 1)
    middleHtml += renderReportEllipsisBtn(Math.max(1, totalPages - 2))
    middleHtml += renderReportPageBtn(totalPages - 1, reportState.currentPage === totalPages - 1)
    middleHtml += renderReportPageBtn(totalPages, reportState.currentPage === totalPages)
  } else {
    middleHtml += renderReportPageBtn(1, false)
    middleHtml += renderReportEllipsisBtn(reportState.currentPage - 1)
    middleHtml += renderReportPageBtn(reportState.currentPage, true)
    middleHtml += renderReportEllipsisBtn(reportState.currentPage + 1)
    middleHtml += renderReportPageBtn(totalPages, false)
  }

  pagination.innerHTML = `${prevItem}${middleHtml}${nextItem}`
}

// Periodic Reports with Simple Table Progress Bars & Data Table view
async function loadReport(): Promise<void> {
  const period = document.querySelector<HTMLSelectElement>("#report-period")!.value
  const year = Number(document.querySelector<HTMLInputElement>("#report-year")!.value)
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  try {
    const result = await api<Analytics>(`/api/analytics?from=${from}&to=${to}&group=${period}`)

    // Filter out future periods so they do not crowd the top of the table
    const todayStr = localDate(new Date())
    const currentWeekStart = mondayOf(todayStr)
    const currentMonthKey = todayStr.slice(0, 7)
    let filtered = result.buckets
    if (period === "week") {
      filtered = result.buckets.filter((b) => b.key <= currentWeekStart)
    } else if (period === "month") {
      filtered = result.buckets.filter((b) => b.key <= currentMonthKey)
    }

    // Sort descending: recent periods first
    filtered.sort((a, b) => b.key.localeCompare(a.key))
    reportState.buckets = filtered
    reportState.period = period
    reportState.currentPage = 1
    reportState.activePeriodKey = null

    await loadReportChart(period)
    renderReportTable()
    setStatus("")
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to load report.", true)
  }
}

function formatBucketKeyLabel(key: string): string {
  if (key.length === 10) {
    const { day, month } = parseDateParts(key)
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
  }
  if (key.length === 7) {
    const [, m] = key.split("-")
    return `T${Number(m)}`
  }
  if (key.includes("Q")) {
    return key.slice(5)
  }
  return key
}

function renderWeeklyPipsCompareChart(svg: SVGSVGElement, weeks: Bucket[]): void {
  const width = Math.max(480, weeks.length * 55)
  const height = 190
  const padding = { top: 20, right: 20, bottom: 35, left: 45 }
  const plotHeight = height - padding.top - padding.bottom
  const plotWidth = width - padding.left - padding.right

  if (weeks.length === 0) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
    svg.replaceChildren()
    return
  }

  const values = weeks.map((w) => w.netPips)
  let min = Math.min(0, ...values)
  let max = Math.max(0, ...values)
  if (min === max) {
    min -= 10
    max += 10
  }
  const margin = Math.max(5, (max - min) * 0.12)
  min -= margin
  max += margin
  const span = max - min
  const yZero = padding.top + ((max - 0) / span) * plotHeight
  const barWidth = Math.max(18, Math.min(36, (plotWidth / weeks.length) * 0.6))
  const step = plotWidth / weeks.length

  const shapes: SVGElement[] = []

  const baseLine = document.createElementNS("http://www.w3.org/2000/svg", "line")
  baseLine.setAttribute("x1", String(padding.left))
  baseLine.setAttribute("x2", String(width - padding.right))
  baseLine.setAttribute("y1", String(yZero))
  baseLine.setAttribute("y2", String(yZero))
  baseLine.setAttribute("stroke", "var(--bs-border-color)")
  baseLine.setAttribute("stroke-dasharray", "3 3")
  shapes.push(baseLine)

  const zeroLabel = document.createElementNS("http://www.w3.org/2000/svg", "text")
  zeroLabel.setAttribute("x", String(padding.left - 6))
  zeroLabel.setAttribute("y", String(yZero + 4))
  zeroLabel.setAttribute("text-anchor", "end")
  zeroLabel.setAttribute("font-size", "10")
  zeroLabel.setAttribute("fill", "var(--bs-secondary-color)")
  zeroLabel.textContent = "0"
  shapes.push(zeroLabel)

  weeks.forEach((w, idx) => {
    const x = padding.left + idx * step + step / 2
    const y = padding.top + ((max - w.netPips) / span) * plotHeight
    const barTop = Math.min(y, yZero)
    const barHeight = Math.max(3, Math.abs(y - yZero))
    const isWin = w.netPips >= 0
    const color = isWin ? "#198754" : "#dc3545"

    const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    bar.setAttribute("x", String(x - barWidth / 2))
    bar.setAttribute("y", String(barTop))
    bar.setAttribute("width", String(barWidth))
    bar.setAttribute("height", String(barHeight))
    bar.setAttribute("rx", "3")
    bar.setAttribute("fill", color)
    bar.setAttribute("opacity", "0.9")

    const labelText = formatBucketKeyLabel(w.key)

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title")
    titleEl.textContent = `Kỳ ${labelText}\nNet: ${formatPips(w.netPips, true)} Pips\nLệnh: ${w.totalTrades} (${w.wins}W / ${w.losses}L)\nWin Rate: ${(w.winRate * 100).toFixed(1)}%`
    bar.append(titleEl)
    shapes.push(bar)

    const valText = document.createElementNS("http://www.w3.org/2000/svg", "text")
    valText.setAttribute("x", String(x))
    valText.setAttribute("y", String(isWin ? barTop - 5 : barTop + barHeight + 12))
    valText.setAttribute("text-anchor", "middle")
    valText.setAttribute("font-size", "10")
    valText.setAttribute("font-weight", "600")
    valText.setAttribute("fill", color)
    valText.textContent = formatPips(w.netPips, true)
    shapes.push(valText)

    const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text")
    xLabel.setAttribute("x", String(x))
    xLabel.setAttribute("y", String(height - 10))
    xLabel.setAttribute("text-anchor", "middle")
    xLabel.setAttribute("font-size", "10")
    xLabel.setAttribute("fill", "currentColor")
    xLabel.textContent = labelText
    shapes.push(xLabel)
  })

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.replaceChildren(...shapes)
}

function renderWeeklyWinRateTrendChart(svg: SVGSVGElement, weeks: Bucket[]): void {
  const width = Math.max(380, weeks.length * 45)
  const height = 190
  const padding = { top: 25, right: 25, bottom: 35, left: 40 }
  const plotHeight = height - padding.top - padding.bottom
  const plotWidth = width - padding.left - padding.right

  if (weeks.length === 0) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
    svg.replaceChildren()
    return
  }

  const shapes: SVGElement[] = []

  // 50% Benchmark Line
  const y50 = padding.top + 0.5 * plotHeight
  const benchLine = document.createElementNS("http://www.w3.org/2000/svg", "line")
  benchLine.setAttribute("x1", String(padding.left))
  benchLine.setAttribute("x2", String(width - padding.right))
  benchLine.setAttribute("y1", String(y50))
  benchLine.setAttribute("y2", String(y50))
  benchLine.setAttribute("stroke", "#ffc107")
  benchLine.setAttribute("stroke-width", "1.5")
  benchLine.setAttribute("stroke-dasharray", "4 3")
  shapes.push(benchLine)

  const benchText = document.createElementNS("http://www.w3.org/2000/svg", "text")
  benchText.setAttribute("x", String(padding.left - 4))
  benchText.setAttribute("y", String(y50 + 4))
  benchText.setAttribute("text-anchor", "end")
  benchText.setAttribute("font-size", "9")
  benchText.setAttribute("font-weight", "600")
  benchText.setAttribute("fill", "#b08800")
  benchText.textContent = "50%"
  shapes.push(benchText)

  const step = plotWidth / Math.max(1, weeks.length - 1 || 1)
  const points: Array<{ x: number; y: number; rate: number; label: string; week: Bucket }> = []

  weeks.forEach((w, idx) => {
    const rate = Math.min(1, Math.max(0, w.winRate))
    const x = weeks.length === 1 ? padding.left + plotWidth / 2 : padding.left + idx * step
    const y = padding.top + (1 - rate) * plotHeight
    const labelText = formatBucketKeyLabel(w.key)
    points.push({ x, y, rate, label: labelText, week: w })
  })

  if (points.length >= 2) {
    const gradId = `winrate-grad-${Math.random().toString(36).slice(2, 7)}`
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs")
    defs.innerHTML = `
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0d6efd" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#0d6efd" stop-opacity="0.02" />
      </linearGradient>
    `
    shapes.push(defs)

    const area = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const lastX = points.at(-1)?.x ?? points[0].x
    const dArea = [
      `M ${points[0].x} ${padding.top + plotHeight}`,
      ...points.map((p) => `L ${p.x} ${p.y}`),
      `L ${lastX} ${padding.top + plotHeight}`,
      "Z"
    ].join(" ")
    area.setAttribute("d", dArea)
    area.setAttribute("fill", `url(#${gradId})`)
    shapes.push(area)
  }

  if (points.length >= 1) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const dLine = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    line.setAttribute("d", dLine)
    line.setAttribute("fill", "none")
    line.setAttribute("stroke", "#0d6efd")
    line.setAttribute("stroke-width", "2.5")
    line.setAttribute("stroke-linecap", "round")
    line.setAttribute("stroke-linejoin", "round")
    shapes.push(line)
  }

  points.forEach((p) => {
    const dotColor = p.rate >= 0.5 ? "#198754" : "#dc3545"
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    circle.setAttribute("cx", String(p.x))
    circle.setAttribute("cy", String(p.y))
    circle.setAttribute("r", "4")
    circle.setAttribute("fill", "#fff")
    circle.setAttribute("stroke", dotColor)
    circle.setAttribute("stroke-width", "2.5")

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title")
    titleEl.textContent = `Week ${p.label}\nWin Rate: ${(p.rate * 100).toFixed(1)}%\n${p.week.wins}W / ${p.week.losses}L\nNet: ${formatPips(p.week.netPips, true)} Pips`
    circle.append(titleEl)
    shapes.push(circle)

    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text")
    textEl.setAttribute("x", String(p.x))
    textEl.setAttribute("y", String(p.y - 7))
    textEl.setAttribute("text-anchor", "middle")
    textEl.setAttribute("font-size", "9.5")
    textEl.setAttribute("font-weight", "600")
    textEl.setAttribute("fill", dotColor)
    textEl.textContent = `${(p.rate * 100).toFixed(0)}%`
    shapes.push(textEl)

    const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text")
    xLabel.setAttribute("x", String(p.x))
    xLabel.setAttribute("y", String(height - 10))
    xLabel.setAttribute("text-anchor", "middle")
    xLabel.setAttribute("font-size", "10")
    xLabel.setAttribute("fill", "currentColor")
    xLabel.textContent = p.label
    shapes.push(xLabel)
  })

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.replaceChildren(...shapes)
}

async function loadWeeklyComparison(year: number): Promise<void> {
  const pipsSvg = document.querySelector<SVGSVGElement>("#weekly-compare-pips-chart")
  const winRateSvg = document.querySelector<SVGSVGElement>("#weekly-compare-winrate-chart")
  if (!pipsSvg && !winRateSvg) return

  try {
    const from = `${year}-01-01`
    const to = `${year}-12-31`
    const analytics = await api<Analytics>(`/api/analytics?from=${from}&to=${to}&group=week`)

    const todayStr = localDate(new Date())
    const currentWeekStart = mondayOf(todayStr)
    const activeWeeks = analytics.buckets.filter((b) => b.key <= currentWeekStart && b.totalTrades > 0)

    if (activeWeeks.length > 0) {
      const latest = activeWeeks.at(-1)!
      const prev = activeWeeks.length >= 2 ? activeWeeks.at(-2) ?? null : null

      const currentPipsEl = document.querySelector("#wc-kpi-current-pips")
      const currentWinrateEl = document.querySelector("#wc-kpi-current-winrate")
      if (currentPipsEl) {
        currentPipsEl.textContent = `${formatPips(latest.netPips, true)} Pips`
        currentPipsEl.className = `fs-5 fw-bold ${latest.netPips >= 0 ? "text-success" : "text-danger"}`
      }
      if (currentWinrateEl) {
        currentWinrateEl.textContent = `Win Rate: ${(latest.winRate * 100).toFixed(1)}% (${latest.wins}W / ${latest.losses}L)`
      }

      const diffPipsEl = document.querySelector("#wc-kpi-diff-pips")
      const diffWinrateEl = document.querySelector("#wc-kpi-diff-winrate")
      if (prev) {
        const diffPips = latest.netPips - prev.netPips
        const diffWinRate = (latest.winRate - prev.winRate) * 100
        if (diffPipsEl) {
          diffPipsEl.textContent = `${formatPips(diffPips, true)} Pips ${diffPips >= 0 ? "▲" : "▼"}`
          diffPipsEl.className = `fs-5 fw-bold ${diffPips >= 0 ? "text-success" : "text-danger"}`
        }
        if (diffWinrateEl) {
          diffWinrateEl.textContent = `Win Rate: ${diffWinRate >= 0 ? "+" : ""}${diffWinRate.toFixed(1)}% vs prior week`
        }
      } else {
        if (diffPipsEl) diffPipsEl.textContent = "— (First week)"
        if (diffWinrateEl) diffWinrateEl.textContent = "No prior week"
      }

      let best = activeWeeks[0]
      for (const w of activeWeeks) {
        if (w.netPips > best.netPips) best = w
      }
      const bestWeekEl = document.querySelector("#wc-kpi-best-week")
      const bestLabelEl = document.querySelector("#wc-kpi-best-label")
      if (bestWeekEl) {
        bestWeekEl.textContent = `${formatPips(best.netPips, true)} Pips`
        bestWeekEl.className = `fs-5 fw-bold ${best.netPips >= 0 ? "text-success" : "text-danger"}`
      }
      if (bestLabelEl) {
        bestLabelEl.textContent = `Week ${formatDateVN(best.key).slice(0, 5)} (WR: ${(best.winRate * 100).toFixed(0)}%)`
      }

      const totalNet = activeWeeks.reduce((acc, w) => acc + w.netPips, 0)
      const avgPips = totalNet / activeWeeks.length
      const totalTrades = activeWeeks.reduce((acc, w) => acc + w.totalTrades, 0)
      const avgTrades = totalTrades / activeWeeks.length
      const avgPipsEl = document.querySelector("#wc-kpi-avg-pips")
      const avgTradesEl = document.querySelector("#wc-kpi-avg-trades")
      if (avgPipsEl) {
        avgPipsEl.textContent = `${formatPips(avgPips, true)} Pips`
        avgPipsEl.className = `fs-5 fw-bold ${avgPips >= 0 ? "text-success" : "text-danger"}`
      }
      if (avgTradesEl) {
        avgTradesEl.textContent = `Avg ${avgTrades.toFixed(1)} trades / week (${activeWeeks.length} weeks)`
      }
    }

    const recentWeeks = activeWeeks.slice(-10)

    if (pipsSvg) {
      renderWeeklyPipsCompareChart(pipsSvg, recentWeeks)
    }
    if (winRateSvg) {
      renderWeeklyWinRateTrendChart(winRateSvg, recentWeeks)
    }
  } catch (error) {
    console.error("Error loading weekly comparison:", error)
  }
}

function getPeriodLabels(p: string): { name: string; unit: string } {
  switch (p) {
    case "month": {
      return { name: "Months", unit: "month" }
    }
    case "quarter": {
      return { name: "Quarters", unit: "quarter" }
    }
    case "year": {
      return { name: "Years", unit: "year" }
    }
    default: {
      return { name: "Weeks", unit: "week" }
    }
  }
}

// Dynamic Period Comparison in Periodic Reports (Week-vs-Week, Month-vs-Month, etc.)
async function loadDynamicPeriodComparison(period: string, year: number): Promise<void> {
  const pipsSvg = document.querySelector<SVGSVGElement>("#period-compare-pips-chart")
  const winRateSvg = document.querySelector<SVGSVGElement>("#period-compare-winrate-chart")
  if (!pipsSvg && !winRateSvg) return

  const { name: periodName, unit: periodUnit } = getPeriodLabels(period)

  // Update Section Headers
  const titleEl = document.querySelector("#period-compare-title")
  const subtitleEl = document.querySelector("#period-compare-subtitle")
  const chart1Title = document.querySelector("#pc-chart-1-title")
  const chart2Title = document.querySelector("#pc-chart-2-title")
  if (titleEl) titleEl.textContent = `Performance Comparison Across ${periodName}`
  if (subtitleEl) subtitleEl.textContent = `Comparing trading performance across ${periodUnit}s in ${year}`
  if (chart1Title) chart1Title.textContent = `Net Pips Comparison Across ${periodName}`
  if (chart2Title) chart2Title.textContent = `Win Rate Trend Across ${periodName} (Win Rate %)`

  // Update KPI Titles
  const kpi1Title = document.querySelector("#pc-kpi-1-title")
  const kpi2Title = document.querySelector("#pc-kpi-2-title")
  const kpi3Title = document.querySelector("#pc-kpi-3-title")
  const kpi4Title = document.querySelector("#pc-kpi-4-title")
  if (kpi1Title) kpi1Title.textContent = `Most Recent ${periodUnit}`
  if (kpi2Title) kpi2Title.textContent = `vs Prior ${periodUnit}`
  if (kpi3Title) kpi3Title.textContent = `Best Performing ${periodUnit}`
  if (kpi4Title) kpi4Title.textContent = `Average Per ${periodUnit}`

  try {
    const from = `${year}-01-01`
    const to = `${year}-12-31`
    const analytics = await api<Analytics>(`/api/analytics?from=${from}&to=${to}&group=${period}`)

    const todayStr = localDate(new Date())
    let currentLimit = todayStr
    switch (period) {
      case "week": {
        currentLimit = mondayOf(todayStr)
        break
      }
      case "month": {
        currentLimit = todayStr.slice(0, 7)
        break
      }
      default: {
        currentLimit = todayStr
        break
      }
    }

    const activeBuckets = analytics.buckets.filter((b) => b.key <= currentLimit && b.totalTrades > 0)

    if (activeBuckets.length > 0) {
      const latest = activeBuckets.at(-1)!
      const prev = activeBuckets.length >= 2 ? activeBuckets.at(-2) ?? null : null

      const kpi1Pips = document.querySelector("#pc-kpi-1-pips")
      const kpi1Sub = document.querySelector("#pc-kpi-1-sub")
      if (kpi1Pips) {
        kpi1Pips.textContent = `${formatPips(latest.netPips, true)} Pips`
        kpi1Pips.className = `fs-5 fw-bold ${latest.netPips >= 0 ? "text-success" : "text-danger"}`
      }
      if (kpi1Sub) {
        kpi1Sub.textContent = `Win Rate: ${(latest.winRate * 100).toFixed(1)}% (${latest.wins}W / ${latest.losses}L)`
      }

      const kpi2Diff = document.querySelector("#pc-kpi-2-diff")
      const kpi2Sub = document.querySelector("#pc-kpi-2-sub")
      if (prev) {
        const diffPips = latest.netPips - prev.netPips
        const diffWinRate = (latest.winRate - prev.winRate) * 100
        if (kpi2Diff) {
          kpi2Diff.textContent = `${formatPips(diffPips, true)} Pips ${diffPips >= 0 ? "▲" : "▼"}`
          kpi2Diff.className = `fs-5 fw-bold ${diffPips >= 0 ? "text-success" : "text-danger"}`
        }
        if (kpi2Sub) {
          kpi2Sub.textContent = `Win Rate: ${diffWinRate >= 0 ? "+" : ""}${diffWinRate.toFixed(1)}% vs prior ${periodUnit}`
        }
      } else {
        if (kpi2Diff) kpi2Diff.textContent = `— (First ${periodUnit})`
        if (kpi2Sub) kpi2Sub.textContent = `No prior ${periodUnit}`
      }

      let best = activeBuckets[0]
      for (const b of activeBuckets) {
        if (b.netPips > best.netPips) best = b
      }
      const kpi3Best = document.querySelector("#pc-kpi-3-best")
      const kpi3Sub = document.querySelector("#pc-kpi-3-sub")
      if (kpi3Best) {
        kpi3Best.textContent = `${formatPips(best.netPips, true)} Pips`
        kpi3Best.className = `fs-5 fw-bold ${best.netPips >= 0 ? "text-success" : "text-danger"}`
      }
      if (kpi3Sub) {
        let bestKeyLabel = best.key
        if (period === "week") bestKeyLabel = `Week ${formatDateVN(best.key).slice(0, 5)}`
        else if (period === "month") bestKeyLabel = `Month ${best.key.slice(5, 7)}`
        kpi3Sub.textContent = `${bestKeyLabel} (WR: ${(best.winRate * 100).toFixed(0)}%)`
      }

      const totalNet = activeBuckets.reduce((acc, b) => acc + b.netPips, 0)
      const avgPips = totalNet / activeBuckets.length
      const totalTrades = activeBuckets.reduce((acc, b) => acc + b.totalTrades, 0)
      const avgTrades = totalTrades / activeBuckets.length
      const kpi4Avg = document.querySelector("#pc-kpi-4-avg")
      const kpi4Sub = document.querySelector("#pc-kpi-4-sub")
      if (kpi4Avg) {
        kpi4Avg.textContent = `${formatPips(avgPips, true)} Pips`
        kpi4Avg.className = `fs-5 fw-bold ${avgPips >= 0 ? "text-success" : "text-danger"}`
      }
      if (kpi4Sub) {
        kpi4Sub.textContent = `TB ${avgTrades.toFixed(1)} lệnh / ${periodUnit} (${activeBuckets.length} ${periodUnit})`
      }
    }

    const recentBuckets = activeBuckets.slice(-10)

    if (pipsSvg) {
      renderWeeklyPipsCompareChart(pipsSvg, recentBuckets)
    }
    if (winRateSvg) {
      renderWeeklyWinRateTrendChart(winRateSvg, recentBuckets)
    }
  } catch (error) {
    console.error("Lỗi tải so sánh kỳ:", error)
  }
}

// Weekly Invoice Export (Matching User Image Figure 1 & Image 2)
function populateInvoiceModal(): void {
  const currentWeekDate = selectedDate?.value || localDate(new Date())
  const start = mondayOf(currentWeekDate)
  const trades = currentTrades()
  const stats = summarize(trades)

  // Account Name & Status
  const accSelect = document.querySelector<HTMLSelectElement>("#account-selector")
  const accName = accSelect?.selectedOptions[0]?.textContent || "Primary Account"
  const invAccEl = document.querySelector("#inv-account-name")
  if (invAccEl) invAccEl.textContent = accName

  const invWeekRange = document.querySelector("#inv-week-range")
  if (invWeekRange) invWeekRange.textContent = formatWeekRangeVN(start)

  const invId = document.querySelector("#inv-id")
  if (invId) invId.textContent = `INV-${start.replaceAll("-", "")}`

  const now = new Date()
  const invDate = document.querySelector("#inv-date")
  if (invDate) {
    const timeVN = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    invDate.textContent = `${formatDateVN(localDate(now))} ${timeVN}`
  }

  const invStatusBadge = document.querySelector("#inv-status-badge")
  if (invStatusBadge) {
    if (stats.netPips > 0) {
      invStatusBadge.textContent = `PROFITABLE (+${formatPips(stats.netPips)} PIPS)`
      invStatusBadge.className = "badge text-bg-success px-3 py-2 fs-6 fw-bold"
    } else if (stats.netPips < 0) {
      invStatusBadge.textContent = `LOSS (${formatPips(stats.netPips)} PIPS)`
      invStatusBadge.className = "badge text-bg-danger px-3 py-2 fs-6 fw-bold"
    } else {
      invStatusBadge.textContent = "BREAK-EVEN (0.00 PIPS)"
      invStatusBadge.className = "badge text-bg-secondary px-3 py-2 fs-6 fw-bold"
    }
  }

  const invTradeCount = document.querySelector("#inv-trade-count")
  if (invTradeCount) invTradeCount.textContent = `${stats.totalTrades} trades`

  // Build Weekly Trades Grid Table
  const dayNames = [
    { short: "Mon (Monday)", full: "Monday" },
    { short: "Tue (Tuesday)", full: "Tuesday" },
    { short: "Wed (Wednesday)", full: "Wednesday" },
    { short: "Thu (Thursday)", full: "Thursday" },
    { short: "Fri (Friday)", full: "Friday" },
    { short: "Sat (Saturday)", full: "Saturday" },
    { short: "Sun (Sunday)", full: "Sunday" }
  ]

  let maxTradesInAnyDay = 1
  const daysData = Array.from({ length: 7 }, (_, i) => {
    const d = dateAtOffset(start, i)
    const dayTrades = tradeRows.get(d) ?? []
    if (dayTrades.length > maxTradesInAnyDay) maxTradesInAnyDay = dayTrades.length
    const dayTotal = dayTrades.reduce((acc, t) => acc + t.pips, 0)
    return { date: d, trades: dayTrades, total: dayTotal, name: dayNames[i] }
  })

  // Table columns count: 1 (Day Name) + maxTradesInAnyDay (Trade 1..N) + 1 (Daily Total)
  const thead = document.querySelector("#inv-table-thead")
  if (thead) {
    let headerCells = '<th scope="col" class="text-start ps-3" style="width: 130px;">Day</th>'
    for (let c = 1; c <= maxTradesInAnyDay; c += 1) {
      headerCells += `<th scope="col" style="min-width: 55px;">Trade ${c}</th>`
    }
    headerCells += '<th scope="col" class="text-end pe-3 fw-bold bg-body-secondary" style="width: 100px;">Total</th>'
    thead.innerHTML = `<tr>${headerCells}</tr>`
  }

  const tbody = document.querySelector("#inv-trades-tbody")
  if (tbody) {
    const rowsHtml = daysData
      .map((d) => {
        let tradeCols = ""
        for (let c = 0; c < maxTradesInAnyDay; c += 1) {
          const trade = d.trades[c]
          if (trade === undefined) {
            tradeCols += '<td class="text-muted small">—</td>'
          } else {
            const pipText = formatPips(trade.pips, true)
            let pipClass = "text-secondary"
            if (trade.pips > 0) pipClass = "text-success fw-bold"
            else if (trade.pips < 0) pipClass = "text-danger fw-bold"
            tradeCols += `<td class="${pipClass}">${pipText}</td>`
          }
        }

        let totalClass = "text-secondary fw-semibold"
        if (d.total > 0) totalClass = "text-success fw-bold"
        else if (d.total < 0) totalClass = "text-danger fw-bold"
        const totalText = d.trades.length > 0 ? formatPips(d.total, true) : "—"

        return `
          <tr>
            <td class="text-start ps-3 fw-semibold">
              ${d.name.short}
              <div class="text-muted small" style="font-size: 0.72rem;">${formatDateVN(d.date).slice(0, 5)}</div>
            </td>
            ${tradeCols}
            <td class="text-end pe-3 ${totalClass} bg-body-secondary font-monospace">${totalText}</td>
          </tr>
        `
      })
      .join("")
    tbody.innerHTML = rowsHtml
  }

  const tfoot = document.querySelector("#inv-trades-tfoot")
  if (tfoot) {
    let weeklyTotalClass = "text-secondary"
    if (stats.netPips > 0) weeklyTotalClass = "text-success"
    else if (stats.netPips < 0) weeklyTotalClass = "text-danger"
    tfoot.innerHTML = `
      <tr class="table-secondary">
        <td class="text-start ps-3 fw-bold text-uppercase" colspan="${maxTradesInAnyDay + 1}">
          WEEKLY SUMMARY (${formatWeekRangeVN(start)})
        </td>
        <td class="text-end pe-3 fw-bold fs-6 ${weeklyTotalClass} font-monospace">
          ${formatPips(stats.netPips, true)}
        </td>
      </tr>
    `
  }

  // Populate Image 2: Trading Statistics Table
  const statTrades = document.querySelector("#inv-stat-trades")
  if (statTrades) statTrades.textContent = String(stats.totalTrades)

  const statWins = document.querySelector("#inv-stat-wins")
  if (statWins) statWins.textContent = String(stats.wins)

  const statLosses = document.querySelector("#inv-stat-losses")
  if (statLosses) statLosses.textContent = String(stats.losses)

  const statBe = document.querySelector("#inv-stat-be")
  if (statBe) statBe.textContent = String(stats.breakEven)

  const statAvgWin = document.querySelector("#inv-stat-avg-win")
  if (statAvgWin) statAvgWin.textContent = stats.averageWin === null ? "0.00" : formatPips(stats.averageWin)

  const statAvgLoss = document.querySelector("#inv-stat-avg-loss")
  if (statAvgLoss) statAvgLoss.textContent = stats.averageLoss === null ? "0.00" : formatPips(stats.averageLoss)

  const statWinrate = document.querySelector("#inv-stat-winrate")
  if (statWinrate) statWinrate.textContent = `${(stats.winRate * 100).toFixed(2)}%`

  const statPayoff = document.querySelector("#inv-stat-payoff")
  if (statPayoff) statPayoff.textContent = stats.payoffRatio === null ? "—" : stats.payoffRatio.toFixed(2)

  const statExpectancy = document.querySelector("#inv-stat-expectancy")
  if (statExpectancy) statExpectancy.textContent = formatPips(stats.expectancy)

  const statNet = document.querySelector("#inv-stat-net")
  if (statNet) {
    statNet.textContent = `${formatPips(stats.netPips, true)} Pips`
    statNet.className = `text-end fw-bold fs-6 ${stats.netPips >= 0 ? "text-success" : "text-danger"}`
  }

  // Weekly Notes
  const invNotes = document.querySelector("#inv-notes")
  if (invNotes) {
    const currentNotes = notesInput?.value?.trim()
    invNotes.textContent = currentNotes || "No specific review notes for this week. Keep following the trading plan."
  }
}

interface FullCalendarGlobal {
  // eslint-disable-next-line no-unused-vars
  Calendar: new (element: HTMLElement, options: Record<string, unknown>) => FullCalendarApi
}

// 4. Interactive FullCalendar View
async function loadFullCalendar(): Promise<void> {
  const container = document.getElementById("full-calendar-container")
  const fullCalendarGlobal = (globalThis as unknown as { FullCalendar?: FullCalendarGlobal }).FullCalendar
  if (!container || !fullCalendarGlobal) return

  // Query trades for full year
  const year = new Date().getFullYear()
  try {
    const trades = await api<Trade[]>(`/api/trades?from=${year}-01-01&to=${year}-12-31`)

    // Group by date for daily summary badges
    const dayTotals = new Map<string, { count: number; netPips: number }>()
    for (const t of trades) {
      const current = dayTotals.get(t.trade_date) || { count: 0, netPips: 0 }
      current.count += 1
      current.netPips += t.pips
      dayTotals.set(t.trade_date, current)
    }

    const summaryEvents = Array.from(dayTotals, ([date, data]) => {
      let color = "#6c757d"
      if (data.netPips > 0) color = "#198754"
      else if (data.netPips < 0) color = "#dc3545"

      return {
        id: `summary-${date}`,
        title: `${data.count} lệnh (${formatPips(data.netPips, true)} pips)`,
        start: date,
        allDay: true,
        color,
        classNames: ["fc-event-summary"],
        extendedProps: {
          tradeDate: date
        }
      }
    })

    const tradeEvents = trades.map((t) => {
      let startTime = t.created_at ? new Date(t.created_at) : new Date(`${t.trade_date}T09:00:00`)
      if (Number.isNaN(startTime.valueOf())) {
        startTime = new Date(`${t.trade_date}T09:00:00`)
      }
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000)
      const color = t.pips >= 0 ? "#198754" : "#dc3545"

      return {
        id: `trade-${t.id}`,
        title: `${formatPips(t.pips, true)} pips`,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        allDay: false,
        color,
        classNames: ["fc-event-trade"],
        extendedProps: {
          tradeId: t.id,
          tradeDate: t.trade_date,
          pips: t.pips,
          note: t.note
        }
      }
    })

    const events = [...summaryEvents, ...tradeEvents]

    if (state.fullCalendarInstance) {
      state.fullCalendarInstance.destroy()
    }

    state.fullCalendarInstance = new fullCalendarGlobal.Calendar(container, {
      initialView: "dayGridMonth",
      locale: "en",
      firstDay: 1,
      scrollTime: "08:00:00",
      slotLabelFormat: {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      },
      eventTimeFormat: {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      },
      buttonText: {
        today: "Today",
        dayGridMonth: "Month",
        timeGridWeek: "Week",
        listMonth: "List",
        month: "Month",
        week: "Week",
        list: "List"
      },
      headerToolbar: {
        start: "prev,next today",
        center: "title",
        end: "dayGridMonth,timeGridWeek,listMonth"
      },
      events,
      dateClick: (info: { dateStr: string }) => {
        globalThis.location.assign(`./weekly-calendar.html?date=${info.dateStr.slice(0, 10)}`)
      },
      eventClick: (info: { event: { extendedProps?: { tradeDate?: string }; start?: Date } }) => {
        const date = info.event.extendedProps?.tradeDate || (info.event.start ? localDate(info.event.start) : "")
        if (date) {
          globalThis.location.assign(`./weekly-calendar.html?date=${date}`)
        }
      },
      datesSet: (dateInfo: { view: { calendar: { getDate: () => Date } } }) => {
        const currentDate = localDate(dateInfo.view.calendar.getDate())
        const jumpDateInput = document.querySelector<HTMLInputElement>("#calendar-jump-date")
        if (jumpDateInput && jumpDateInput.value !== currentDate) {
          jumpDateInput.value = currentDate
        }
        const toolbarInput = container.querySelector<HTMLInputElement>("#fc-toolbar-date-picker")
        if (toolbarInput && toolbarInput.value !== currentDate) {
          toolbarInput.value = currentDate
        }
      }
    })
    state.fullCalendarInstance.render()

    // Sync card header jump date picker
    const jumpDateInput = document.querySelector<HTMLInputElement>("#calendar-jump-date")
    if (jumpDateInput) {
      jumpDateInput.value = localDate(state.fullCalendarInstance.getDate())
      jumpDateInput.addEventListener("change", () => {
        if (jumpDateInput.value && state.fullCalendarInstance) {
          state.fullCalendarInstance.gotoDate(jumpDateInput.value)
        }
      })
    }

    // Insert date picker into FullCalendar start toolbar next to prev/next/today
    const toolbarStart = container.querySelector(".fc-toolbar-chunk:first-child")
    if (toolbarStart && !container.querySelector("#fc-toolbar-date-picker")) {
      const wrapper = document.createElement("div")
      wrapper.className = "d-inline-flex align-items-center ms-2"
      wrapper.innerHTML = `
        <input
          type="date"
          id="fc-toolbar-date-picker"
          class="form-control form-control-sm"
          style="width: 140px; height: 35px; vertical-align: middle;"
          value="${localDate(state.fullCalendarInstance.getDate())}"
          aria-label="Chọn ngày xem lịch"
        />
      `
      toolbarStart.append(wrapper)
      const toolbarInput = wrapper.querySelector<HTMLInputElement>("#fc-toolbar-date-picker")
      toolbarInput?.addEventListener("change", () => {
        if (toolbarInput.value && state.fullCalendarInstance) {
          state.fullCalendarInstance.gotoDate(toolbarInput.value)
          if (jumpDateInput) jumpDateInput.value = toolbarInput.value
        }
      })
    }
  } catch (error) {
    console.error("Calendar error:", error)
  }
}

// 5. Account Profiles Management
async function loadAccounts(): Promise<void> {
  try {
    const accounts = await api<Account[]>("/api/accounts")
    if (accountSelector) {
      accountSelector.innerHTML = accounts
        .map(
          (acc) =>
            `<option value="${acc.id}" ${acc.id === state.currentAccountId ? "selected" : ""}>${acc.display_name}</option>`
        )
        .join("")
    }

    const listTable = document.querySelector("#accounts-table-body")
    if (listTable) {
      listTable.innerHTML = accounts
        .map(
          (acc) => {
            const isActive = acc.id === state.currentAccountId
            let statusBadge = '<span class="badge text-bg-light border">Phụ</span>'
            let actionButton = `<button class="btn btn-sm btn-outline-primary" data-action="switch-account" data-id="${acc.id}">
                   Chọn tài khoản này
                 </button>`

            if (isActive) {
              statusBadge = '<span class="badge text-bg-success">Đang kích hoạt</span>'
              actionButton = '<span class="text-secondary small">Đang dùng</span>'
            }

            return `
              <tr>
                <td class="fw-bold">${acc.display_name}</td>
                <td>${formatDateTimeVN(acc.created_at)}</td>
                <td>${statusBadge}</td>
                <td class="text-end">${actionButton}</td>
              </tr>
            `
          }
        )
        .join("")
    }
  } catch (error) {
    console.error("Accounts error:", error)
  }
}

// Navigation Tabs Handling
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((tab) => {
      const active = tab === button
      tab.classList.toggle("btn-primary", active)
      tab.classList.toggle("btn-outline-primary", !active)
    })
    document.querySelectorAll<HTMLElement>(".journal-view").forEach((view) => {
      view.hidden = view.id !== `${button.dataset.view}-view`
    })

    const view = button.dataset.view
    const breadcrumb = document.querySelector("#breadcrumb-current")
    const calToolbar = document.querySelector<HTMLElement>("#calendar-header-toolbar")
    switch (view) {
      case "dashboard": {
        if (breadcrumb) breadcrumb.textContent = "Dashboard"
        if (calToolbar) calToolbar.classList.add("d-none")
        void loadDashboard()

        break
      }
      case "reports": {
        if (breadcrumb) breadcrumb.textContent = "Periodic Reports"
        if (calToolbar) calToolbar.classList.add("d-none")
        void loadReport()

        break
      }
      case "full-calendar": {
        if (breadcrumb) breadcrumb.textContent = "Trade Activity Calendar"
        if (calToolbar) calToolbar.classList.add("d-none")
        void loadFullCalendar()

        break
      }
      case "accounts": {
        if (breadcrumb) breadcrumb.textContent = "Trading Accounts & Profile"
        if (calToolbar) calToolbar.classList.add("d-none")
        void loadAccounts()

        break
      }
      default: {
        if (breadcrumb) breadcrumb.textContent = "Weekly Calendar"
        if (calToolbar) calToolbar.classList.remove("d-none")
      }
    }
  })
})

// Account Selector Event
accountSelector?.addEventListener("change", () => {
  state.currentAccountId = accountSelector.value
  localStorage.setItem("active_account_id", state.currentAccountId)
  if (selectedDate) void loadWeek(selectedDate.value)
  if (document.querySelector("#dashboard-summary")) void loadDashboard()
  if (document.querySelector("#report-rows")) void loadReport()
  if (document.querySelector("#full-calendar-container")) void loadFullCalendar()
  void loadAccounts()
  setStatus(`Switched to account: ${accountSelector.selectedOptions[0]?.text}`)
})

// Switch account button in accounts table
document.querySelector("#accounts-table-body")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-action="switch-account"]'
  )
  if (!btn?.dataset.id) return
  state.currentAccountId = btn.dataset.id
  localStorage.setItem("active_account_id", state.currentAccountId)
  if (accountSelector) accountSelector.value = state.currentAccountId
  void loadAccounts()
  if (selectedDate) void loadWeek(selectedDate.value)
  if (document.querySelector("#dashboard-summary")) void loadDashboard()
  if (document.querySelector("#report-rows")) void loadReport()
  if (document.querySelector("#full-calendar-container")) void loadFullCalendar()
  setStatus("Switched account successfully.")
})

// New Account Form Validation (AdminLTE Pattern)
const newAccountForm = document.querySelector<HTMLFormElement>("#new-account-form")
newAccountForm?.addEventListener("submit", async (e) => {
  e.preventDefault()
  if (!newAccountForm.checkValidity()) {
    e.stopPropagation()
    newAccountForm.classList.add("was-validated")
    return
  }
  const nameInput = document.querySelector<HTMLInputElement>("#accountNameInput")!
  const displayName = nameInput.value.trim()
  try {
    const newAcc = await api<Account>("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ display_name: displayName })
    })
    state.currentAccountId = newAcc.id
    localStorage.setItem("active_account_id", state.currentAccountId)
    nameInput.value = ""
    newAccountForm.classList.remove("was-validated")
    await loadAccounts()
    if (selectedDate) void loadWeek(selectedDate.value)
    if (document.querySelector("#dashboard-summary")) void loadDashboard()
    if (document.querySelector("#report-rows")) void loadReport()
    if (document.querySelector("#full-calendar-container")) void loadFullCalendar()
    setStatus(`Created and activated account: ${newAcc.display_name}`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Error creating account", true)
  }
})

// Toolbar buttons
document.querySelector("#previous-week")?.addEventListener("click", () => {
  if (selectedDate) void loadWeek(dateAtOffset(selectedDate.value, -7))
})
document.querySelector("#next-week")?.addEventListener("click", () => {
  if (selectedDate) void loadWeek(dateAtOffset(selectedDate.value, 7))
})
document.querySelector("#current-week")?.addEventListener("click", () => {
  void loadWeek(localDate(new Date()))
})
selectedDate?.addEventListener("change", () => {
  if (selectedDate) void loadWeek(selectedDate.value)
})
document.querySelector("#dashboard-load")?.addEventListener("click", () => void loadDashboard())
document.querySelector("#report-load")?.addEventListener("click", () => void loadReport())
document.querySelector("#report-period")?.addEventListener("change", () => void loadReport())
// Compare periods modal synchronization & submit handler
document.querySelector("#btn-compare-periods")?.addEventListener("click", () => {
  const currentPeriod = document.querySelector<HTMLSelectElement>("#report-period")?.value || "week"
  const currentYear = Number(document.querySelector<HTMLInputElement>("#report-year")?.value) || new Date().getFullYear()
  const modalPeriod = document.querySelector<HTMLSelectElement>("#modal-compare-period")
  const modalYear = document.querySelector<HTMLInputElement>("#modal-compare-year")
  if (modalPeriod) modalPeriod.value = currentPeriod
  if (modalYear) modalYear.value = String(currentYear)
})

document.querySelector("#btn-submit-compare")?.addEventListener("click", async () => {
  const modalPeriod = document.querySelector<HTMLSelectElement>("#modal-compare-period")?.value || "week"
  const modalYear = Number(document.querySelector<HTMLInputElement>("#modal-compare-year")?.value) || new Date().getFullYear()
  const compareCard = document.querySelector<HTMLElement>("#period-comparison-card")
  if (compareCard) compareCard.classList.remove("d-none")

  // Dismiss modal
  const modalEl = document.querySelector("#comparePeriodsModal")
  if (modalEl) {
    modalEl.querySelector<HTMLButtonElement>('[data-bs-dismiss="modal"]')?.click()
  }

  await loadDynamicPeriodComparison(modalPeriod, modalYear)
  compareCard?.scrollIntoView({ behavior: "smooth", block: "start" })
})

// Weekly invoice direct print handler (PDF export)
document.querySelector("#btn-export-invoice")?.addEventListener("click", () => {
  populateInvoiceModal()
  // Trigger print directly without modal popup
  setTimeout(() => {
    globalThis.print()
  }, 100)
})

// Calendar trade actions
daysElement?.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]")
  if (!button) return
  const action = button.dataset.action
  const tradeId = button.dataset.tradeId
  const date = button.dataset.tradeDate
  const currentWeekDate = selectedDate?.value || localDate(new Date())

  switch (action) {
    case "add-trade": {
      if (!date) return
      state.addingTradeDate = date
      state.editingTradeId = null
      renderCalendar(mondayOf(currentWeekDate))
      document.querySelector<HTMLInputElement>(`[data-new-trade-date="${date}"]`)?.focus()
      break
    }
    case "edit-trade": {
      if (!tradeId) return
      state.editingTradeId = tradeId
      state.addingTradeDate = null
      renderCalendar(mondayOf(currentWeekDate))
      const input = document.querySelector<HTMLInputElement>(`[data-trade-input="${tradeId}"]`)
      input?.focus()
      input?.select()
      break
    }
    case "cancel-edit": {
      state.editingTradeId = null
      renderCalendar(mondayOf(currentWeekDate))
      break
    }
    case "cancel-add": {
      state.addingTradeDate = null
      renderCalendar(mondayOf(currentWeekDate))
      break
    }
    case "save-add": {
      const input = button.parentElement?.querySelector<HTMLInputElement>("[data-new-trade-date]")
      const tradeDate = input?.dataset.newTradeDate
      if (input && tradeDate) await saveNewTrade(tradeDate, input)
      break
    }
    case "save-edit": {
      const input = button.parentElement?.querySelector<HTMLInputElement>("[data-trade-input]")
      const targetId = tradeId || input?.dataset.tradeInput || state.editingTradeId
      if (!targetId || !input) return
      await updateTrade(targetId, input)
      break
    }
    case "delete-trade": {
      if (!tradeId || !globalThis.confirm("Delete this trade? This action cannot be undone.")) return
      try {
        await api<void>(`/api/trades/${tradeId}`, { method: "DELETE" })
        for (const [tradeDate, trades] of tradeRows) {
          tradeRows.set(
            tradeDate,
            trades.filter((trade) => trade.id !== tradeId)
          )
        }
        renderCalendar(mondayOf(currentWeekDate))
        setStatus("Trade successfully deleted.")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to delete trade.", true)
      }
      break
    }
    default: {
      break
    }
  }
})

document.querySelector("#report-rows")?.addEventListener("click", (event) => {
  const chartBtn = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-action="view-chart"]'
  )
  if (chartBtn?.dataset.periodKey) {
    reportState.activePeriodKey = chartBtn.dataset.periodKey
    void loadReportChart(reportState.period, chartBtn.dataset.periodKey)
    renderReportTable()
    document.querySelector("#report-chart")?.scrollIntoView({ behavior: "smooth", block: "center" })
    return
  }

  const historyBtn = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-action="view-history"]'
  )
  if (!historyBtn?.dataset.periodDate) return
  const calendarTab = document.querySelector<HTMLButtonElement>('[data-view="calendar"]')
  if (calendarTab) {
    calendarTab.click()
    void loadWeek(historyBtn.dataset.periodDate)
  } else {
    // Multi-page navigation: navigate directly to weekly-calendar.html
    globalThis.location.assign(`./weekly-calendar.html?date=${historyBtn.dataset.periodDate}`)
  }
})

document.querySelector("#report-pagination")?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-page]")
  if (!button?.dataset.page) return
  const targetPage = Number(button.dataset.page)
  const totalPages = Math.max(1, Math.ceil(reportState.buckets.length / reportState.pageSize))
  if (targetPage >= 1 && targetPage <= totalPages) {
    reportState.currentPage = targetPage
    renderReportTable()
  }
})

daysElement?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return
  const input = event.target
  event.preventDefault()
  if (input.dataset.newTradeDate) void saveNewTrade(input.dataset.newTradeDate, input)
  if (input.dataset.tradeInput) void updateTrade(input.dataset.tradeInput, input)
})

notesInput?.addEventListener("input", () => {
  if (reviewStatus) reviewStatus.textContent = "Đang lưu thay đổi..."
  if (state.reviewSaveTimer) clearTimeout(state.reviewSaveTimer)
  const currentWeekDate = selectedDate?.value || localDate(new Date())
  const weekStart = mondayOf(currentWeekDate)
  const notes = notesInput.value
  state.reviewSaveTimer = setTimeout(async () => {
    try {
      await api(`/api/reviews/${weekStart}`, {
        method: "PUT",
        body: JSON.stringify({ notes })
      })
      if (reviewStatus) reviewStatus.textContent = "Đã lưu nhận xét tuần."
    } catch (error) {
      if (reviewStatus) {
        reviewStatus.textContent =
          error instanceof Error ? error.message : "Unable to save weekly review."
      }
    }
  }, 500)
})

const today = localDate(new Date())
const urlParams = new URLSearchParams(globalThis.location.search)
const initialDate = urlParams.get("date") || today

if (selectedDate) selectedDate.value = initialDate
const dashDateInput = document.querySelector<HTMLInputElement>("#dashboard-date")
if (dashDateInput) dashDateInput.value = today
const repYearInput = document.querySelector<HTMLInputElement>("#report-year")
if (repYearInput) repYearInput.value = String(new Date().getFullYear())

// Initialize depending on active page elements
void loadAccounts()
if (daysElement) {
  void loadWeek(initialDate)
}
if (document.querySelector("#dashboard-summary")) {
  void loadDashboard()
}
if (document.querySelector("#report-rows")) {
  void loadReport()
}
if (document.querySelector("#full-calendar-container")) {
  void loadFullCalendar()
}
