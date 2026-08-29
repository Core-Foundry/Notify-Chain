#!/usr/bin/env node
const { program } = require('commander')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(require('os').homedir(), '.notify-chain')
const FILE = path.join(CONFIG_DIR, 'filters.json')

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function readFilters() {
  try {
    if (!fs.existsSync(FILE)) return []
    const raw = fs.readFileSync(FILE, 'utf8')
    return JSON.parse(raw || '[]')
  } catch (e) {
    console.error('Failed to read filters:', e.message)
    return []
  }
}

function writeFilters(filters) {
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(filters, null, 2), 'utf8')
}

program.name('notify-filters').description('Manage saved notification filters').version('0.1.0')

program
  .command('list')
  .description('List saved filters')
  .action(() => {
    const filters = readFilters()
    if (filters.length === 0) {
      console.log('No saved filters')
      return
    }
    filters.forEach((f) => console.log(`${f.id}\t${f.name}`))
  })

program
  .command('save')
  .description('Save a filter (pass JSON query via --query)')
  .requiredOption('-n, --name <name>')
  .requiredOption('-q, --query <json>')
  .action((opts) => {
    const filters = readFilters()
    const now = new Date().toISOString()
    const id = `f_${Math.random().toString(36).slice(2, 9)}`
    let query = {}
    try {
      query = JSON.parse(opts.query)
    } catch (e) {
      console.error('Invalid JSON for --query')
      process.exit(2)
    }
    const filter = { id, name: opts.name, query, createdAt: now, updatedAt: now }
    filters.unshift(filter)
    writeFilters(filters)
    console.log('Saved', id)
  })

program
  .command('delete')
  .description('Delete a saved filter by id')
  .argument('<id>')
  .action((id) => {
    const filters = readFilters()
    const next = filters.filter((f) => f.id !== id)
    writeFilters(next)
    console.log('Deleted', id)
  })

program
  .command('get')
  .description('Get a saved filter as JSON')
  .argument('<id>')
  .action((id) => {
    const filters = readFilters()
    const f = filters.find((x) => x.id === id)
    if (!f) {
      console.error('Not found')
      process.exit(1)
    }
    console.log(JSON.stringify(f, null, 2))
  })

program.parse(process.argv)
