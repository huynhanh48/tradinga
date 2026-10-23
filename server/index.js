import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import express from "express"
import pg from "pg"
import { calculateBuckets, calculateStatistics } from "./statistics.js"

const { Pool } = pg
const app = express()
const port = Number(process.env.PORT ?? 3002)
const defaultUserId = process.env.JOURNAL_USER_ID ?? "00000000-0000-4000-8000-000000000001"
const buildDirectory = fileURLToPath(new URL("../dist/", import.meta.url))
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
})

app.use(express.json({ limit: "32kb" }))

function getUserId(req) {
  const headerId = req.headers["x-user-id"]
  if (
    typeof headerId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(headerId)
  ) {
    return headerId
  }
  return defaultUserId
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validPips(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) >= 100000000) {
    return false
  }
  return Math.round(value * 10000) === value * 10000
}

function validNote(value) {
  return typeof value === "string" && value.length <= 2000
}

function validateRange(req, res, next) {
  const { from, to } = req.query
  if (!isDate(from) || !isDate(to) || from > to) {
    return res.status(400).json({ error: "Provide a valid from/to date range (YYYY-MM-DD)." })
  }
  next()
}

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1")
  res.json({ status: "ok" })
})

// Accounts / Profiles API
app.get("/api/accounts", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, display_name, created_at FROM users ORDER BY created_at ASC"
  )
  res.json(result.rows)
})

app.post("/api/accounts", async (req, res) => {
  const { display_name } = req.body ?? {}
  if (!display_name || typeof display_name !== "string" || display_name.trim().length === 0) {
    return res.status(400).json({ error: "Tên tài khoản không được để trống." })
  }
  const result = await pool.query(
    `INSERT INTO users (id, display_name)
     VALUES (gen_random_uuid(), $1)
     RETURNING id, display_name, created_at`,
    [display_name.trim()]
  )
  res.status(201).json(result.rows[0])
})

// Trades API
app.get("/api/trades", validateRange, async (req, res) => {
  const currentUserId = getUserId(req)
  const result = await pool.query(
    `SELECT id, trade_date::text, pips::float8 AS pips, note, created_at, updated_at
     FROM trades
     WHERE user_id = $1 AND trade_date BETWEEN $2 AND $3
     ORDER BY trade_date, created_at, id`,
    [currentUserId, req.query.from, req.query.to]
  )
  res.json(result.rows)
})

app.post("/api/trades", async (req, res) => {
  const currentUserId = getUserId(req)
  const { trade_date: tradeDate, pips, note = "", created_at: createdAt } = req.body ?? {}
  if (!isDate(tradeDate) || !validPips(pips) || !validNote(note)) {
    return res
      .status(400)
      .json({ error: "A valid trade_date, pips value (up to 4 decimals), and note are required." })
  }
  let validCreatedAt = null
  if (createdAt && typeof createdAt === "string") {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.valueOf())) {
      validCreatedAt = d
    }
  }
  const result = await pool.query(
    `INSERT INTO trades (user_id, trade_date, pips, note, created_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
     RETURNING id, trade_date::text, pips::float8 AS pips, note, created_at, updated_at`,
    [currentUserId, tradeDate, pips, note, validCreatedAt]
  )
  res.status(201).json(result.rows[0])
})

app.put("/api/trades/:id", async (req, res) => {
  const currentUserId = getUserId(req)
  const { trade_date: tradeDate, pips, note, created_at: createdAt } = req.body ?? {}
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      req.params.id
    ) ||
    !isDate(tradeDate) ||
    !validPips(pips) ||
    !validNote(note)
  ) {
    return res
      .status(400)
      .json({ error: "A valid trade id, trade_date, pips value, and note are required." })
  }
  let validCreatedAt = null
  if (createdAt && typeof createdAt === "string") {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.valueOf())) {
      validCreatedAt = d
    }
  }
  const result = await pool.query(
    `UPDATE trades
     SET trade_date = $3,
         pips = $4,
         note = $5,
         created_at = COALESCE($6, created_at),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, trade_date::text, pips::float8 AS pips, note, created_at, updated_at`,
    [req.params.id, currentUserId, tradeDate, pips, note, validCreatedAt]
  )
  if (!result.rowCount) {
    return res.status(404).json({ error: "Trade not found." })
  }
  res.json(result.rows[0])
})

app.delete("/api/trades/:id", async (req, res) => {
  const currentUserId = getUserId(req)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      req.params.id
    )
  ) {
    return res.status(400).json({ error: "A valid trade id is required." })
  }
  const result = await pool.query("DELETE FROM trades WHERE id = $1 AND user_id = $2", [
    req.params.id,
    currentUserId
  ])
  if (!result.rowCount) {
    return res.status(404).json({ error: "Trade not found." })
  }
  res.status(204).end()
})

app.get("/api/analytics", validateRange, async (req, res) => {
  const currentUserId = getUserId(req)
  const group = req.query.group ?? "week"
  if (!["day", "week", "month", "quarter", "year"].includes(group)) {
    return res.status(400).json({ error: "group must be day, week, month, quarter, or year." })
  }
  const result = await pool.query(
    `SELECT trade_date::text, pips::float8 AS pips
     FROM trades
     WHERE user_id = $1 AND trade_date BETWEEN $2 AND $3
     ORDER BY trade_date`,
    [currentUserId, req.query.from, req.query.to]
  )
  res.json({
    summary: calculateStatistics(result.rows),
    buckets: calculateBuckets(result.rows, req.query.from, req.query.to, group)
  })
})

app.get("/api/reviews/:weekStart", async (req, res) => {
  const currentUserId = getUserId(req)
  if (!isDate(req.params.weekStart)) {
    return res.status(400).json({ error: "weekStart must be a valid YYYY-MM-DD date." })
  }
  const result = await pool.query(
    "SELECT week_start::text, notes FROM weekly_reviews WHERE user_id = $1 AND week_start = $2",
    [currentUserId, req.params.weekStart]
  )
  res.json(result.rows[0] ?? { week_start: req.params.weekStart, notes: "" })
})

app.put("/api/reviews/:weekStart", async (req, res) => {
  const currentUserId = getUserId(req)
  const { notes } = req.body ?? {}
  if (!isDate(req.params.weekStart) || !validNote(notes)) {
    return res
      .status(400)
      .json({ error: "Provide a valid weekStart and notes (up to 2,000 characters)." })
  }
  const result = await pool.query(
    `INSERT INTO weekly_reviews (user_id, week_start, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, week_start)
     DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
     RETURNING week_start::text, notes`,
    [currentUserId, req.params.weekStart, notes]
  )
  res.json(result.rows[0])
})

app.get("/", (_req, res) => {
  res.redirect("/index.html")
})
app.use(express.static(buildDirectory))

app.use((error, _req, res, next) => {
  console.error("API request failed:", error)
  if (res.headersSent) return next(error)
  const status =
    Number.isSafeInteger(error.status) && error.status >= 400 && error.status < 600 ?
      error.status :
      500
  res
    .status(status)
    .json({ error: "The request could not be completed. Check the server and database logs." })
})

async function start() {
  const schema = await readFile(fileURLToPath(new URL("schema.sql", import.meta.url)), "utf8")
  await pool.query(schema)
  await pool.query(
    "INSERT INTO users (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [defaultUserId, process.env.JOURNAL_USER_NAME ?? "Primary Account"]
  )
  app.listen(port, () => console.log(`Trading Journal API listening on http://localhost:${port}`))
}

try {
  await start()
} catch (error) {
  console.error("Unable to initialize Trading Journal API:", error)
  process.exitCode = 1
}
