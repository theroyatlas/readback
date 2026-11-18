import {
  CATEGORIES,
  createEntry,
  filterEntries,
  formatDate,
  formatMoney,
  formatSigned,
  formatTaipeiLong,
  loadEntries,
  saveEntries,
  sortEntries,
  summarize,
  taipeiToday,
} from './ledger.js'

const form = document.querySelector('#entry-form')
const amountInput = document.querySelector('#amount')
const categorySelect = document.querySelector('#category')
const dateInput = document.querySelector('#date')
const noteInput = document.querySelector('#note')
const errorEl = document.querySelector('#form-error')
const balanceEl = document.querySelector('#balance')
const incomeEl = document.querySelector('#total-income')
const expenseEl = document.querySelector('#total-expense')
const balanceHint = document.querySelector('#balance-hint')
const list = document.querySelector('#entries')
const emptyEl = document.querySelector('#empty')
const countEl = document.querySelector('#entry-count')
const todayEl = document.querySelector('#today')

let entries = loadEntries(localStorage)
let filter = 'all'

todayEl.textContent = formatTaipeiLong()
dateInput.value = taipeiToday()
fillCategories('expense')
render()

form.addEventListener('change', (event) => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.name === 'type') {
    fillCategories(target.value, categorySelect.value)
  }
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  errorEl.textContent = ''
  let entry
  try {
    entry = createEntry({
      type: selectedType(),
      amount: amountInput.value,
      category: categorySelect.value,
      date: dateInput.value,
      note: noteInput.value,
    })
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : '無法加入這筆紀錄'
    amountInput.focus()
    return
  }

  entries = [...entries, entry]
  const saved = persist()
  amountInput.value = ''
  noteInput.value = ''
  if (filter !== 'all' && filter !== entry.type) setFilter('all')
  render(entry.id)
  list.querySelector(`[data-id="${CSS.escape(entry.id)}"]`)?.scrollIntoView({ block: 'nearest' })
  if (!saved) errorEl.textContent = '這筆已加到畫面上，但瀏覽器沒有存下來，重新整理後會消失。'
  amountInput.focus()
})

for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    setFilter(button.dataset.filter ?? 'all')
    render()
  })
}

function selectedType() {
  const checked = form.querySelector('input[name="type"]:checked')
  return checked instanceof HTMLInputElement ? checked.value : 'expense'
}

function fillCategories(type, preferred) {
  const names = CATEGORIES[type] ?? CATEGORIES.expense
  categorySelect.replaceChildren()
  for (const name of names) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    categorySelect.append(option)
  }
  categorySelect.value = names.includes(preferred) ? preferred : names[0]
}

function setFilter(next) {
  filter = next === 'income' || next === 'expense' ? next : 'all'
  for (const button of document.querySelectorAll('[data-filter]')) {
    button.setAttribute('aria-pressed', String(button.dataset.filter === filter))
  }
}

function persist() {
  try {
    saveEntries(localStorage, entries)
    return true
  } catch {
    return false
  }
}

function render(highlightId) {
  const totals = summarize(entries)
  balanceEl.textContent = formatMoney(totals.balance)
  balanceEl.classList.toggle('is-negative', totals.balance < 0)
  incomeEl.textContent = formatMoney(totals.income)
  expenseEl.textContent = formatMoney(totals.expense)
  balanceHint.hidden = filter === 'all'

  const visible = sortEntries(filterEntries(entries, filter))
  list.replaceChildren(...visible.map((entry) => renderItem(entry, entry.id === highlightId)))
  list.hidden = visible.length === 0
  emptyEl.hidden = visible.length > 0
  emptyEl.textContent =
    entries.length === 0
      ? '還沒有紀錄。記一筆收入或支出，餘額會跟著更新。'
      : '這個篩選沒有紀錄。'
  countEl.textContent =
    filter === 'all' ? `共 ${entries.length} 筆` : `顯示 ${visible.length} 筆，全部 ${entries.length} 筆`
}

function renderItem(entry, highlight) {
  const item = document.createElement('li')
  item.className = highlight ? 'entry is-new' : 'entry'
  item.dataset.id = entry.id

  const main = document.createElement('div')
  const title = document.createElement('p')
  title.className = 'entry-title'

  const category = document.createElement('span')
  category.className = 'cat'
  category.textContent = entry.category
  title.append(category)

  if (entry.note) {
    const note = document.createElement('span')
    note.className = 'note'
    note.textContent = entry.note
    title.append(note)
  }

  const date = document.createElement('p')
  date.className = 'entry-date'
  date.textContent = formatDate(entry.date)

  main.append(title, date)

  const side = document.createElement('div')
  side.className = 'entry-side'

  const money = document.createElement('p')
  money.className = `money ${entry.type}`
  money.textContent = formatSigned(entry)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'delete'
  remove.textContent = '刪除'
  const kind = entry.type === 'income' ? '收入' : '支出'
  remove.setAttribute('aria-label', `刪除${kind}，${entry.category}，${formatSigned(entry)}`)
  remove.addEventListener('click', () => {
    const label = `${entry.category} ${entry.note ? entry.note + ' ' : ''}${formatSigned(entry)}`
    if (!window.confirm(`要刪除這筆${kind}嗎？\n${label}`)) return
    entries = entries.filter((item) => item.id !== entry.id)
    const saved = persist()
    render()
    if (!saved) errorEl.textContent = '這筆已從畫面上刪掉，但瀏覽器沒有存下來，重新整理後會再出現。'
  })

  side.append(money, remove)
  item.append(main, side)
  return item
}
