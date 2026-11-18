import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATEGORIES,
  createEntry,
  filterEntries,
  formatDate,
  formatMoney,
  formatTaipeiLong,
  formatSigned,
  isIsoDate,
  loadEntries,
  parseAmount,
  saveEntries,
  sortEntries,
  STORAGE_KEY,
  summarize,
  taipeiToday,
} from './ledger.js'

function memoryStorage(initial) {
  const map = new Map(initial)
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  }
}

test('parses whole dollars, decimals, commas, and fullwidth digits into cents', () => {
  assert.equal(parseAmount('120'), 12000)
  assert.equal(parseAmount('120.5'), 12050)
  assert.equal(parseAmount('120.50'), 12050)
  assert.equal(parseAmount('1,200'), 120000)
  assert.equal(parseAmount('１，２００'), 120000)
  assert.equal(parseAmount(' 0.50 '), 50)
})

test('rejects empty, zero, negative, and over-precise amounts', () => {
  assert.throws(() => parseAmount(''), /請輸入金額/)
  assert.throws(() => parseAmount('0'), /大於 0/)
  assert.throws(() => parseAmount('0.00'), /大於 0/)
  assert.throws(() => parseAmount('-5'), /數字/)
  assert.throws(() => parseAmount('12.345'), /兩位小數/)
  assert.throws(() => parseAmount('午餐'), /數字/)
})

test('creates income and expense entries and refuses a mismatched category', () => {
  const income = createEntry(
    { type: 'income', amount: '45000', category: '薪資', date: '2026-11-01', note: ' 十一月 ' },
    { id: 'pay', now: 10 },
  )
  assert.deepEqual(income, {
    id: 'pay',
    type: 'income',
    amount: 4500000,
    category: '薪資',
    note: '十一月',
    date: '2026-11-01',
    createdAt: 10,
  })

  const expense = createEntry(
    { type: 'expense', amount: '80', category: '飲食', date: '2026-11-18', note: '' },
    { id: 'lunch', now: 11 },
  )
  assert.equal(expense.amount, 8000)
  assert.throws(() => createEntry({ type: 'income', amount: '1', category: '飲食', date: '2026-11-18' }), /分類/)
  assert.ok(CATEGORIES.expense.includes('交通'))
})

test('rejects an impossible date and keeps notes short', () => {
  assert.equal(isIsoDate('2026-02-31'), false)
  assert.throws(
    () => createEntry({ type: 'expense', amount: '1', category: '交通', date: '2026-02-31' }),
    /日期/,
  )
  const note = '備'.repeat(90)
  const entry = createEntry(
    { type: 'expense', amount: '1', category: '交通', date: '2026-11-18', note },
    { id: 'long', now: 1 },
  )
  assert.equal(entry.note.length, 80)
})

test('balance is income minus expense', () => {
  const entries = [
    { type: 'income', amount: 4500000 },
    { type: 'expense', amount: 8000 },
    { type: 'expense', amount: 12000 },
  ]
  assert.deepEqual(summarize(entries), { income: 4500000, expense: 20000, balance: 4480000 })
  assert.deepEqual(summarize([]), { income: 0, expense: 0, balance: 0 })
})

test('lists newest dates first and does not reorder the stored array', () => {
  const entries = [
    { id: 'a', date: '2026-11-01', createdAt: 1, type: 'income' },
    { id: 'b', date: '2026-11-18', createdAt: 2, type: 'expense' },
    { id: 'c', date: '2026-11-18', createdAt: 5, type: 'expense' },
  ]
  assert.deepEqual(
    sortEntries(entries).map((entry) => entry.id),
    ['c', 'b', 'a'],
  )
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    filterEntries(entries, 'expense').map((entry) => entry.id),
    ['b', 'c'],
  )
  assert.equal(filterEntries(entries, 'all').length, 3)
})

test('formats money and dates in Traditional Chinese', () => {
  assert.equal(formatMoney(0), 'NT$0')
  assert.equal(formatMoney(12000), 'NT$120')
  assert.equal(formatMoney(12050), 'NT$120.50')
  assert.equal(formatMoney(4500000), 'NT$45,000')
  assert.equal(formatMoney(-10000), '-NT$100')
  assert.equal(formatSigned({ type: 'income', amount: 4500000 }), '+NT$45,000')
  assert.equal(formatSigned({ type: 'expense', amount: 8000 }), '-NT$80')
  assert.equal(formatDate('2026-11-18', '2026-11-18'), '11月18日')
  assert.equal(formatDate('2025-01-02', '2026-11-18'), '2025年1月2日')
})

test('uses the Taipei calendar date around midnight UTC', () => {
  assert.equal(taipeiToday(new Date('2026-11-17T15:59:00Z')), '2026-11-17')
  assert.equal(taipeiToday(new Date('2026-11-17T16:30:00Z')), '2026-11-18')
  assert.equal(formatTaipeiLong(new Date('2026-11-18T04:00:00Z')), '2026年11月18日 週三')
})

test('saves entries and drops corrupt or duplicate rows on load', () => {
  const storage = memoryStorage()
  const entry = createEntry(
    { type: 'expense', amount: '80', category: '飲食', date: '2026-11-18', note: '便當' },
    { id: 'lunch', now: 3 },
  )
  saveEntries(storage, [entry])
  assert.deepEqual(loadEntries(storage), [entry])
  assert.ok(storage.getItem(STORAGE_KEY).includes('便當'))

  storage.setItem(STORAGE_KEY, '{')
  assert.deepEqual(loadEntries(storage), [])

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      entry,
      { ...entry },
      { id: 'bad', type: 'income', amount: 0, category: '薪資', note: '', date: '2026-11-01', createdAt: 1 },
      { id: 'keep', type: 'income', amount: 100, category: '獎金', note: '', date: '2026-11-02', createdAt: 2 },
    ]),
  )
  assert.deepEqual(
    loadEntries(storage).map((item) => item.id),
    ['lunch', 'keep'],
  )
})
