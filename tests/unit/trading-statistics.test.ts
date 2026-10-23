import { describe, expect, it } from "vitest"
import { calculateBuckets, calculateStatistics } from "../../server/statistics.js"

describe("trading statistics", () => {
  it("calculates wins, losses, break-even trades and expectancy", () => {
    const stats = calculateStatistics([{ pips: 10 }, { pips: -4 }, { pips: 0 }, { pips: 2 }])

    expect(stats).toEqual({
      totalTrades: 4,
      wins: 2,
      losses: 1,
      breakEven: 1,
      averageWin: 6,
      averageLoss: 4,
      winRate: 0.5,
      payoffRatio: 1.5,
      expectancy: 2,
      netPips: 8
    })
  })

  it("avoids division by zero when a period has no winning or losing trades", () => {
    const stats = calculateStatistics([{ pips: 0 }])

    expect(stats.averageWin).toBeNull()
    expect(stats.averageLoss).toBeNull()
    expect(stats.payoffRatio).toBeNull()
    expect(stats.expectancy).toBe(0)
    expect(stats.winRate).toBe(0)
  })

  it("includes empty buckets and groups weeks starting on Monday", () => {
    const buckets = calculateBuckets(
      [
        { trade_date: "2026-01-04", pips: 5 },
        { trade_date: "2026-01-05", pips: -2 }
      ],
      "2026-01-01",
      "2026-01-11",
      "week"
    )

    expect(buckets.map((bucket) => bucket.key)).toEqual(["2025-12-29", "2026-01-05"])
    expect(buckets.map((bucket) => bucket.netPips)).toEqual([5, -2])
  })

  it("aggregates empty monthly, quarterly and yearly report periods", () => {
    const monthly = calculateBuckets(
      [{ trade_date: "2026-03-31", pips: 3 }],
      "2026-01-01",
      "2026-04-30",
      "month"
    )
    const quarterly = calculateBuckets(
      [{ trade_date: "2026-03-31", pips: 3 }],
      "2026-01-01",
      "2026-12-31",
      "quarter"
    )
    const yearly = calculateBuckets(
      [{ trade_date: "2026-03-31", pips: 3 }],
      "2025-01-01",
      "2026-12-31",
      "year"
    )

    expect(monthly.map((bucket) => bucket.totalTrades)).toEqual([0, 0, 1, 0])
    expect(quarterly.map((bucket) => bucket.key)).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4"
    ])
    expect(yearly.map((bucket) => bucket.netPips)).toEqual([0, 3])
  })

  it("aggregates daily report periods for a week", () => {
    const daily = calculateBuckets(
      [
        { trade_date: "2026-10-19", pips: 10 },
        { trade_date: "2026-10-21", pips: -5 }
      ],
      "2026-10-19",
      "2026-10-25",
      "day"
    )
    expect(daily).toHaveLength(7)
    expect(daily.map((b) => b.key)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25"
    ])
    expect(daily[0].netPips).toBe(10)
    expect(daily[2].netPips).toBe(-5)
    expect(daily[1].totalTrades).toBe(0)
  })
})
