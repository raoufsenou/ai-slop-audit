#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRecords, checkReport, proofsToVerify, statusTable, summarize, verifyProofs } from './records.mjs'

const RECORDS = 'docs/audit'
const REPORTS = 'reports'
const USAGE = 'Usage: node check-records.mjs [app] [--complete] [--report]'

export function commandPlan(args) {
  const plan = { app: null, complete: false, report: false }
  const apps = []
  for (const arg of args) {
    if (arg === '--complete') plan.complete = true
    else if (arg === '--report') plan.report = true
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}\n${USAGE}`)
    else apps.push(arg)
  }
  if (apps.length > 1) throw new Error(USAGE)
  if (apps.length === 1) {
    if (/[\\/]/.test(apps[0]) || apps[0].startsWith('.')) throw new Error(`${apps[0]} is not an app: name its folder in ${RECORDS}/\n${USAGE}`)
    plan.app = apps[0]
  }
  return plan
}

// Every file under the folder, named from it with forward slashes. Hidden files are the system's, such as
// .DS_Store, not the records'. Neither is the reports/ folder, which holds the app's reports.
export function readFolder(folder) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory() && directory === folder && entry.name === REPORTS) continue
      if (entry.isDirectory()) visit(path)
      else files.push({ name: relative(folder, path).split(sep).join('/'), text: readFileSync(path, 'utf8') })
    }
  }
  visit(folder)
  return files.sort((left, right) => (left.name < right.name ? -1 : 1))
}

function git(root, args, input) {
  const result = spawnSync('git', args, { cwd: root, input, maxBuffer: 1024 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.toString().trim()}`)
  return result.stdout
}

const names = (output) => output.toString('utf8').split('\0').filter(Boolean)

// The objects `git cat-file --batch` printed for each request, in order: a blob's text, or null for anything
// else, including an object that does not exist.
function batchContents(output, count) {
  const contents = []
  let at = 0
  for (let index = 0; index < count; index++) {
    const end = output.indexOf(10, at)
    const header = output.toString('utf8', at, end).split(' ')
    at = end + 1
    if (header.length !== 3) {
      contents.push(null)
      continue
    }
    const size = Number(header[2])
    contents.push(header[1] === 'blob' ? output.toString('utf8', at, at + size) : null)
    at += size + 1
  }
  return contents
}

// The project's files as the proofs see them: today, the files Git tracks or would add, as they are on disk;
// at a commit, the files that commit holds. Paths are from the root. It also tells whether Git ignores a path.
export function projectLook(root) {
  const lists = new Map()
  const texts = new Map()
  const key = (commit, path) => `${commit ?? ''}\0${path}`
  return {
    knows(commit) {
      return spawnSync('git', ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { cwd: root }).status === 0
    },
    ignores(path) {
      return spawnSync('git', ['check-ignore', '--quiet', path], { cwd: root }).status === 0
    },
    list(paths, commit) {
      const listed = key(commit, paths.join('\0'))
      if (!lists.has(listed)) {
        const found =
          commit === null
            ? names(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths])).filter((path) =>
                existsSync(resolve(root, path)),
              )
            : names(git(root, ['ls-tree', '-r', '-z', '--name-only', commit, '--', ...paths]))
        lists.set(listed, [...new Set(found)])
      }
      return lists.get(listed)
    },
    read(paths, commit) {
      const unread = paths.filter((path) => !texts.has(key(commit, path)))
      if (commit === null) {
        for (const path of unread) {
          const absolute = resolve(root, path)
          texts.set(key(null, path), existsSync(absolute) && statSync(absolute).isFile() ? readFileSync(absolute, 'utf8') : null)
        }
      } else if (unread.length > 0) {
        const output = git(root, ['cat-file', '--batch'], unread.map((path) => `${commit}:./${path}\n`).join(''))
        batchContents(output, unread.length).forEach((text, index) => texts.set(key(commit, unread[index]), text))
      }
      return new Map(paths.map((path) => [path, texts.get(key(commit, path))]))
    },
  }
}

export function runCheck({ root, app, complete = false, report = false, look = projectLook(root) }) {
  const records = `${RECORDS}/${app}`
  const folder = resolve(root, records)
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return { errors: [`there are no records at ${records}`], summary: [], verified: 0 }
  const result = checkRecords(readFolder(folder), { complete })
  const errors = [...result.errors]
  const reports = `${records}/${REPORTS}`
  if (existsSync(resolve(root, reports)) && !look.ignores(reports)) errors.push(`Git does not ignore ${reports}/: add ${RECORDS}/*/${REPORTS}/ to .gitignore`)
  let verified = 0
  if (errors.length === 0) {
    for (const version of result.records.versions) {
      if (!look.knows(version.commit)) errors.push(`${version.name}'s commit ${version.commit} is not a commit of this repository`)
    }
  }
  if (errors.length === 0) {
    const items = proofsToVerify(result.records).filter((item) => item.proof.kind !== 'eye')
    errors.push(...verifyProofs(items, look))
    verified = items.length
  }
  if (report && errors.length === 0) {
    const target = result.records.versions.at(-1).report
    const absolute = resolve(root, target)
    if (!existsSync(absolute)) errors.push(`the latest version's report, ${target}, does not exist`)
    else {
      const exists = (path) => existsSync(resolve(dirname(absolute), path))
      errors.push(...checkReport(result.records, readFileSync(absolute, 'utf8'), exists))
    }
  }
  return { errors, summary: errors.length === 0 ? [...summarize(result.records), ...statusTable(result.records)] : [], verified }
}

// The app named, or every app in docs/audit/, which holds one folder per app, named for it, and nothing else.
export function runChecks({ root, app = null, complete = false, report = false, look = projectLook(root) }) {
  const check = (name) => ({ records: `${RECORDS}/${name}`, ...runCheck({ root, app: name, complete, report, look }) })
  if (app !== null) return [check(app)]
  const folder = resolve(root, RECORDS)
  const entries = existsSync(folder) && statSync(folder).isDirectory() ? readdirSync(folder, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.')) : []
  const files = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name)
  const refused = (error) => [{ records: RECORDS, errors: [error], summary: [], verified: 0 }]
  if (entries.length === 0) return refused(`there are no records at ${RECORDS}`)
  if (files.length > 0) {
    return refused(`${RECORDS}/ holds one folder per app, named for it, and nothing else, but it holds ${files.sort().join(', ')}: an app's records move, unchanged, into ${RECORDS}/<app>/`)
  }
  return entries.map((entry) => entry.name).sort().map(check)
}

function main() {
  let plan
  try {
    plan = commandPlan(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 2
  }
  const results = runChecks({ root: process.cwd(), ...plan })
  for (const { records, errors, summary, verified } of results) {
    if (errors.length > 0) {
      process.stderr.write(`Audit records failed: ${records}\n${errors.map((error) => `- ${error}`).join('\n')}\n`)
      continue
    }
    const checked = [`${verified} ${verified === 1 ? 'proof' : 'proofs'} verified`, plan.complete && 'complete', plan.report && 'report checked']
    process.stdout.write(`Audit records passed: ${records} (${checked.filter(Boolean).join(', ')})\n${summary.join('\n')}\n`)
  }
  return results.some((result) => result.errors.length > 0) ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main()
