export function calculateStatistics(trades) {
  let wins = 0
  let losses = 0
  let breakEven = 0
  let winningPips = 0
  let losingPips = 0
  let netPips = 0

  for (const trade of trades) {
    const pips = Number(trade.pips)
    netPips += pips
    if (pips > 0) {
      wins += 1
      winningPips += pips
    } else if (pips < 0) {
      losses += 1
      losingPips += Math.abs(pips)
    } else {
      breakEven += 1
    }
  }

  const totalTrades = trades.length
  const averageWin = wins ? winningPips / wins : null
  const averageLoss = losses ? losingPips / losses : null
  const winRate = totalTrades ? wins / totalTrades : 0
  const lossRate = totalTrades ? losses / totalTrades : 0

  return {
    totalTrades,
    wins,
    losses,
    breakEven,
    averageWin,
    averageLoss,
    winRate,
    payoffRatio: averageWin !== null && averageLoss ? averageWin / averageLoss : null,
    expectancy: winRate * (averageWin ?? 0) - lossRate * (averageLoss ?? 0),
    netPips
  }
}

function keyForDate(date, group) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()

  if (group === "day") {
    return date.toISOString().slice(0, 10)
  }
  if (group === "week") {
    const monday = new Date(Date.UTC(year, month, date.getUTCDate()))
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    return monday.toISOString().slice(0, 10)
  }
  if (group === "month") {
    return `${year}-${String(month + 1).padStart(2, "0")}`
  }
  if (group === "quarter") {
    return `${year}-Q${Math.floor(month / 3) + 1}`
  }
  return String(year)
}

function firstBucketDate(date, group) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()

  if (group === "day") {
    return new Date(Date.UTC(year, month, date.getUTCDate()))
  }
  if (group === "week") {
    const monday = new Date(Date.UTC(year, month, date.getUTCDate()))
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    return monday
  }
  if (group === "month") {
    return new Date(Date.UTC(year, month, 1))
  }
  if (group === "quarter") {
    return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1))
  }
  return new Date(Date.UTC(year, 0, 1))
}

export function calculateBuckets(trades, from, to, group) {
  const start = firstBucketDate(new Date(`${from}T00:00:00Z`), group)
  const end = new Date(`${to}T00:00:00Z`)
  const keys = []

  for (const cursor = new Date(start); cursor <= end;) {
    keys.push(keyForDate(cursor, group))
    advanceBucket(cursor, group)
  }

  const groups = new Map(keys.map((key) => [key, []]))
  for (const trade of trades) {
    const key = keyForDate(new Date(`${trade.trade_date}T00:00:00Z`), group)
    groups.get(key)?.push(trade)
  }

  return keys.map((key) => ({
    key,
    ...calculateStatistics(groups.get(key))
  }))
}

function advanceBucket(date, group) {
  switch (group) {
    case "day": {
      date.setUTCDate(date.getUTCDate() + 1)
      break
    }
    case "week": {
      date.setUTCDate(date.getUTCDate() + 7)
      break
    }
    case "month": {
      date.setUTCMonth(date.getUTCMonth() + 1)
      break
    }
    case "quarter": {
      date.setUTCMonth(date.getUTCMonth() + 3)
      break
    }
    default: {
      date.setUTCFullYear(date.getUTCFullYear() + 1)
    }
  }
}
