/** Personal ledger math. Amounts are integer cents so totals do not drift. */

export const STORAGE_KEY = 'personal-ledger.v1'

export const CATEGORIES = Object.freeze({
  income: Object.freeze(['薪資', '獎金', '投資', '其他收入']),
  expense: Object.freeze(['飲食', '交通', '居住', '購物', '娛樂', '醫療', '其他支出']),
})

const NOTE_LIMIT = 80

export function taipeiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function formatTaipeiLong(now = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(now)
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}年${pick('month')}月${pick('day')}日 ${pick('weekday')}`
}

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function normalizeAmountText(raw) {
  return String(raw ?? '')
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replaceAll('．', '.')
    .replaceAll('，', '')
    .replaceAll(',', '')
    .trim()
}

/** Parse a user-typed amount into cents. Rejects zero, negatives, and extra decimals. */
export function parseAmount(raw) {
  const text = normalizeAmountText(raw)
  if (!text) throw new Error('請輸入金額')
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text)
  if (!match) throw new Error('金額請填數字')
  const whole = match[1]
  const frac = match[2] ?? ''
  if (frac.length > 2) throw new Error('金額最多兩位小數')
  if (whole.length > 10) throw new Error('金額太大')
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
  if (cents <= 0) throw new Error('金額要大於 0')
  return cents
}

export function createEntry(input, options = {}) {
  const type = input?.type
  if (type !== 'income' && type !== 'expense') throw new Error('請選擇收入或支出')
  const amount = parseAmount(input.amount)
  const category = String(input.category ?? '').trim()
  if (!CATEGORIES[type].includes(category)) throw new Error('請選擇分類')
  const date = String(input.date ?? '').trim()
  if (!isIsoDate(date)) throw new Error('請選擇有效日期')
  const note = String(input.note ?? '').trim().slice(0, NOTE_LIMIT)
  const id = options.id ?? crypto.randomUUID()
  const createdAt = options.now ?? Date.now()
  return { id, type, amount, category, note, date, createdAt }
}

export function isEntry(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 80 &&
    (value.type === 'income' || value.type === 'expense') &&
    Number.isSafeInteger(value.amount) &&
    value.amount > 0 &&
    typeof value.category === 'string' &&
    value.category.trim().length > 0 &&
    value.category.length <= 40 &&
    typeof value.note === 'string' &&
    value.note.length <= NOTE_LIMIT &&
    isIsoDate(value.date) &&
    Number.isFinite(value.createdAt)
  )
}

export function summarize(entries) {
  let income = 0
  let expense = 0
  for (const entry of entries) {
    if (entry.type === 'income') income += entry.amount
    else if (entry.type === 'expense') expense += entry.amount
  }
  return { income, expense, balance: income - expense }
}

export function filterEntries(entries, filter) {
  if (filter === 'income' || filter === 'expense') {
    return entries.filter((entry) => entry.type === filter)
  }
  return entries.slice()
}

export function sortEntries(entries) {
  return entries.toSorted((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
    return a.id < b.id ? -1 : 1
  })
}

export function formatMoney(cents) {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.trunc(abs / 100)
  const frac = abs % 100
  const digits = new Intl.NumberFormat('zh-TW').format(whole)
  const text = frac === 0 ? `NT$${digits}` : `NT$${digits}.${String(frac).padStart(2, '0')}`
  return negative ? `-${text}` : text
}

export function formatSigned(entry) {
  const money = formatMoney(entry.amount)
  return entry.type === 'expense' ? `-${money}` : `+${money}`
}

export function formatDate(iso, today = taipeiToday()) {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const sameYear = year === Number(today.slice(0, 4))
  const monthDay = `${month}月${day}日`
  return sameYear ? monthDay : `${year}年${monthDay}`
}

export function loadEntries(storage) {
  let parsed
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set()
  const entries = []
  for (const item of parsed) {
    if (!isEntry(item) || seen.has(item.id)) continue
    seen.add(item.id)
    entries.push({
      id: item.id,
      type: item.type,
      amount: item.amount,
      category: item.category.trim(),
      note: item.note.trim(),
      date: item.date,
      createdAt: item.createdAt,
    })
  }
  return entries
}

export function saveEntries(storage, entries) {
  storage.setItem(STORAGE_KEY, JSON.stringify(entries))
}
