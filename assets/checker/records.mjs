// The audit records' format is described in references/records.md, and this module is its only
// implementation. It touches nothing itself: the caller passes in the records' files and, for the proofs, a
// look at the project's files today and at a commit.

export const FORMAT = 'app-slop-audit records 1'
export const KINDS = ['defect', 'design', 'missing']
export const SEVERITIES = ['high', 'medium', 'low']
export const VERDICTS = ['accepted', 'rejected', 'deferred']
export const STATUSES = ['open', 'accepted', 'done', 'regressed', 'deferred', 'triggered', 'rejected', 'obsolete']
export const OUTCOMES = ['open', 'holds', 'regressed', 'waiting', 'triggered', 'obsolete']

// What a later version's re-check may find, by where the finding stood, and where each outcome leaves it. A
// finding in any other state is left alone.
const RECHECK = {
  open: { open: 'open', obsolete: 'obsolete' },
  accepted: { open: 'accepted', obsolete: 'obsolete' },
  regressed: { open: 'regressed', obsolete: 'obsolete' },
  done: { holds: 'done', regressed: 'regressed', obsolete: 'obsolete' },
  deferred: { waiting: 'deferred', triggered: 'triggered', obsolete: 'obsolete' },
  triggered: { waiting: 'deferred', triggered: 'triggered', obsolete: 'obsolete' },
}
const UNFINISHED = new Set(['open', 'accepted', 'regressed', 'triggered'])
const SETTLED = new Set(['accepted', 'done', 'regressed'])
const WORKABLE = new Set(['accepted', 'regressed'])
const VERDICT_FIELDS = { accepted: 'doneWhen', rejected: 'reason', deferred: 'trigger' }
const STANDARDS = ['designAuthority', 'high', 'medium', 'low']
const OUT_OF_SCOPE = 'out of scope: '

const FINDING_ID = /^([A-Z]{1,2})([1-9]\d*)$/
const PRINCIPLE_ID = /^P([1-9]\d*)$/
const AUDIT_FILE = /^v([1-9]\d*)\.json$/
const ROUND_FILE = /^v([1-9]\d*)-verdicts(?:-([1-9]\d*))?\.json$/
const FIX_FILE = /^fixes\/([A-Za-z0-9][A-Za-z0-9._-]*)\.json$/
const CLEARED_TARGET = /^cleared in v([1-9]\d*): (.+)$/s

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isPath = (value) => isText(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..')
const isPointer = (value) => typeof value === 'string' && (value === '' || (value.startsWith('/') && !/~(?![01])/.test(value)))
const listOf = (test, some) => (value) => Array.isArray(value) && (!some || value.length > 0) && value.every(test)

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const TYPES = {
  text: [isText, 'a non-empty string'],
  texts: [listOf(isText), 'a list of non-empty strings'],
  someTexts: [listOf(isText, true), 'a non-empty list of non-empty strings'],
  date: [isDate, 'a real date written YYYY-MM-DD'],
  commit: [(value) => typeof value === 'string' && /^[0-9a-f]{7,40}$/.test(value), 'a commit hash'],
  list: [Array.isArray, 'a list'],
  object: [isObject, 'an object'],
  count: [(value) => Number.isInteger(value) && value >= 0, 'a whole number'],
  version: [(value) => Number.isInteger(value) && value >= 1, 'a version number, such as 1'],
  flag: [(value) => typeof value === 'boolean', 'true or false'],
  path: [isPath, 'a path inside the project, from its root'],
  paths: [listOf(isPath, true), 'a non-empty list of paths inside the project, from its root'],
  pointers: [listOf(isPointer), 'a list of JSON pointers, such as "/devDependencies/typescript"'],
}

// Optional keys end in "?".
const SHAPES = {
  config: { format: 'text', standards: 'object', areas: 'list', 'outOfScope?': 'list' },
  area: { letter: 'text', name: 'text', covers: 'text' },
  outOfScope: { what: 'text', source: 'text' },
  audit: {
    date: 'date',
    commit: 'commit',
    scope: 'text',
    report: 'path',
    'note?': 'text',
    'rechecked?': 'list',
    'reopens?': 'list',
    'raised?': 'list',
    'cleared?': 'texts',
  },
  recheck: { finding: 'text', outcome: 'text', observed: 'text' },
  proposal: { target: 'text', evidence: 'text', recommendation: 'text' },
  finding: { id: 'text', title: 'text', kind: 'text', severity: 'text', where: 'text', problem: 'text', proposal: 'text' },
  round: {
    date: 'date',
    by: 'text',
    'source?': 'text',
    'note?': 'text',
    'decisions?': 'list',
    'reopens?': 'list',
    'principles?': 'list',
  },
  decision: {
    finding: 'text',
    verdict: 'text',
    'doneWhen?': 'text',
    'reason?': 'text',
    'trigger?': 'text',
    'reverses?': 'text',
    'note?': 'text',
  },
  answer: { target: 'text', answer: 'text', why: 'text' },
  principle: { id: 'text', 'rule?': 'text', 'from?': 'someTexts', 'changed?': 'text', 'retired?': 'text' },
  fix: { version: 'version', date: 'date', findings: 'list' },
  entry: { id: 'text', 'proofs?': 'list', 'left?': 'text', 'departs?': 'text', 'earlierSteps?': 'texts' },
}

const PROOF_SHAPES = {
  test: { kind: 'text', file: 'path', title: 'text', 'note?': 'text' },
  search: {
    kind: 'text',
    patterns: 'someTexts',
    paths: 'paths',
    before: 'count',
    now: 'count',
    'fixed?': 'flag',
    'word?': 'flag',
    'glob?': 'text',
    'note?': 'text',
  },
  text: { kind: 'text', file: 'path', holds: 'someTexts', 'note?': 'text' },
  json: { kind: 'text', file: 'path', 'present?': 'pointers', 'absent?': 'pointers', 'note?': 'text' },
  eye: { kind: 'text', compared: 'text', screenshot: 'path', 'note?': 'text' },
}

const has = (value, key) => Object.hasOwn(value, key)
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

function either(items) {
  return items.length < 3 ? items.join(' or ') : `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`
}

// Reports each key the shape does not name, and answers whether every key the rest of the check reads is
// there and of its type.
function checkShape(value, shape, where, errors) {
  if (!isObject(value)) {
    errors.push(`${where} is not an object`)
    return false
  }
  const keys = Object.keys(shape).map((key) => key.replace(/\?$/, ''))
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(`${where} has "${key}", which the format does not name; it takes ${keys.join(', ')}`)
  }
  let sound = true
  for (const [entry, type] of Object.entries(shape)) {
    const key = entry.replace(/\?$/, '')
    if (!has(value, key)) {
      if (!entry.endsWith('?')) {
        errors.push(`${where} gives no ${key}`)
        sound = false
      }
      continue
    }
    const [test, description] = TYPES[type]
    if (!test(value[key])) {
      errors.push(`${where}'s ${key} is not ${description}`)
      sound = false
    }
  }
  return sound
}

function readFiles(files, errors) {
  const read = { config: null, audits: new Map(), rounds: new Map(), fixes: [] }
  for (const { name, text } of files) {
    const audit = AUDIT_FILE.exec(name)
    const round = ROUND_FILE.exec(name)
    const fix = FIX_FILE.exec(name)
    if (name !== 'config.json' && !audit && !round && !fix) {
      errors.push(
        `${name} does not belong in the records, which hold config.json, vN.json, vN-verdicts.json, vN-verdicts-K.json, and fixes/STEP.json`,
      )
      continue
    }
    if (round?.[2] === '1') {
      errors.push(`${name} should be named v${round[1]}-verdicts.json: a version's first round carries no number`)
      continue
    }
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      errors.push(`${name} is not valid JSON: ${error.message}`)
      continue
    }
    if (audit) read.audits.set(Number(audit[1]), data)
    else if (round) {
      const version = Number(round[1])
      if (!read.rounds.has(version)) read.rounds.set(version, new Map())
      read.rounds.get(version).set(round[2] ? Number(round[2]) : 1, { name, data })
    } else if (fix) read.fixes.push({ name, step: fix[1], data })
    else read.config = data
  }
  return read
}

function readConfig(data, errors) {
  if (data === null) {
    errors.push('there is no config.json')
    return null
  }
  if (!checkShape(data, SHAPES.config, 'config.json', errors)) return null
  if (data.format !== FORMAT) errors.push(`config.json's format is "${data.format}", where these records are read as "${FORMAT}"`)
  for (const name of STANDARDS) {
    if (!has(data.standards, name)) errors.push(`config.json's standards give no ${name}`)
  }
  for (const [name, value] of Object.entries(data.standards)) {
    if (!isText(value)) errors.push(`config.json's standard ${name} is not a non-empty string`)
  }
  const areas = new Map()
  for (const [index, area] of data.areas.entries()) {
    const where = `config.json: areas[${index}]`
    if (!checkShape(area, SHAPES.area, where, errors)) continue
    if (!/^[A-Z]{1,2}$/.test(area.letter) || area.letter === 'P') {
      errors.push(`${where}'s letter "${area.letter}" is not one or two capital letters other than P, which principles use`)
    } else if (areas.has(area.letter)) errors.push(`config.json declares area ${area.letter} twice`)
    else areas.set(area.letter, area)
  }
  if (data.areas.length === 0) errors.push('config.json declares no area')
  const outOfScope = new Set()
  for (const [index, item] of (data.outOfScope ?? []).entries()) {
    if (!checkShape(item, SHAPES.outOfScope, `config.json: outOfScope[${index}]`, errors)) continue
    if (outOfScope.has(item.what)) errors.push(`config.json leaves "${item.what}" out of scope twice`)
    outOfScope.add(item.what)
  }
  return { areas, outOfScope }
}

function readFixFiles(read, errors) {
  const fixes = []
  for (const fix of read.fixes) {
    if (!checkShape(fix.data, SHAPES.fix, fix.name, errors)) continue
    const label = `v${fix.data.version}`
    if (!read.audits.has(fix.data.version)) errors.push(`${fix.name} acts on ${label}, which has no ${label}.json`)
    else if (fix.data.findings.length === 0) errors.push(`${fix.name} names no finding`)
    else fixes.push(fix)
  }
  // The steps after one audit are read by date, and those of one day by name.
  return fixes.sort((left, right) => compare(left.data.date, right.data.date) || compare(left.step, right.step))
}

function roundsOf(rounds, version, errors) {
  if (!rounds) return []
  const ordered = []
  for (const [index, number] of [...rounds.keys()].sort((left, right) => left - right).entries()) {
    if (number !== index + 1) {
      const missing = `${version.label}-verdicts${index === 0 ? '' : `-${index + 1}`}.json`
      errors.push(`${rounds.get(number).name} has no ${missing} before it; a version's rounds count from its first without gaps`)
      break
    }
    ordered.push(rounds.get(number))
  }
  return ordered
}

function dated(records, name, date, errors) {
  const last = records.lastDated
  if (last && date < last.date) errors.push(`${name} is dated ${date}, before ${last.name} (${last.date}), which it follows; dates never go back`)
  records.lastDated = { name, date }
}

function readAudit(records, number, data, errors) {
  const label = `v${number}`
  const version = {
    number,
    label,
    name: `${label}.json`,
    date: null,
    commit: null,
    report: null,
    raised: [],
    rechecked: [],
    proposals: new Map(),
    cleared: [],
    rounds: [],
    fixes: [],
  }
  const previous = records.versions.at(-1)
  records.versions.push(version)
  for (const [target, proposal] of previous?.proposals ?? []) {
    if (!proposal.answer) errors.push(`${previous.name} proposes reopening ${target}, and no round answered it before ${label}`)
  }
  if (!checkShape(data, SHAPES.audit, version.name, errors)) return version
  Object.assign(version, { date: data.date, commit: data.commit, report: data.report, cleared: data.cleared ?? [] })
  dated(records, version.name, data.date, errors)
  readRechecks(records, version, data.rechecked ?? [], errors)
  readProposals(records, version, data.reopens ?? [], errors)
  readRaised(records, version, data.raised ?? [], errors)
  const cleared = new Set()
  for (const item of version.cleared) {
    if (cleared.has(item)) errors.push(`${version.name} clears "${item}" twice`)
    cleared.add(item)
  }
  return version
}

function readRechecks(records, version, entries, errors) {
  const due = [...records.findings.values()].filter((finding) => has(RECHECK, finding.status))
  const seen = new Set()
  for (const [index, entry] of entries.entries()) {
    if (!checkShape(entry, SHAPES.recheck, `${version.name}: rechecked[${index}]`, errors)) continue
    const finding = records.findings.get(entry.finding)
    if (!finding) {
      errors.push(`${version.name} re-checks ${entry.finding}, which no earlier version raised`)
      continue
    }
    if (seen.has(finding.id)) {
      errors.push(`${version.name} re-checks ${finding.id} twice`)
      continue
    }
    seen.add(finding.id)
    const outcomes = RECHECK[finding.status]
    if (!outcomes) {
      errors.push(`${version.name} re-checks ${finding.id}, which is ${finding.status}; later versions leave a ${finding.status} finding alone`)
      continue
    }
    if (!has(outcomes, entry.outcome)) {
      errors.push(
        `${version.name} re-checks ${finding.id} as "${entry.outcome}"; a finding that was ${finding.status} is re-checked as ${either(Object.keys(outcomes))}`,
      )
      continue
    }
    const status = outcomes[entry.outcome]
    if (status === 'regressed' && finding.status !== 'regressed') finding.entries = []
    finding.status = status
    version.rechecked.push({ finding: finding.id, outcome: entry.outcome })
  }
  for (const finding of due) {
    if (!seen.has(finding.id)) {
      errors.push(
        `${version.name} does not re-check ${finding.id}, which was ${finding.status}; a later version re-checks every finding still open, accepted, done, regressed, deferred, or triggered`,
      )
    }
  }
}

function targetKind(target) {
  if (PRINCIPLE_ID.test(target)) return 'principle'
  if (FINDING_ID.test(target)) return 'finding'
  if (target.startsWith(OUT_OF_SCOPE)) return 'outOfScope'
  if (CLEARED_TARGET.test(target)) return 'cleared'
  return null
}

function targetProblem(records, version, target, kind) {
  if (kind === 'finding') {
    const finding = records.findings.get(target)
    if (!finding) return `${target}, which no earlier version raised`
    return finding.decided ? null : `${target}, which no round has decided`
  }
  if (kind === 'principle') {
    const principle = records.principles.get(target)
    if (!principle) return `${target}, which no round has written`
    return principle.retired ? `${target}, which ${principle.retiredIn} retired` : null
  }
  if (kind === 'cleared') {
    const [, number, item] = CLEARED_TARGET.exec(target)
    const earlier = records.versions[Number(number) - 1]
    if (!earlier || earlier.number >= version.number) return `what v${number} cleared, which is not an earlier version`
    return earlier.cleared.includes(item) ? null : `"${item}", which v${number} did not clear in those words`
  }
  return null
}

function readProposals(records, version, entries, errors) {
  for (const [index, entry] of entries.entries()) {
    const where = `${version.name}: reopens[${index}]`
    if (!checkShape(entry, SHAPES.proposal, where, errors)) continue
    const kind = targetKind(entry.target)
    if (!kind) {
      errors.push(
        `${where}'s target "${entry.target}" is neither a finding's ID, a principle's ID, "${OUT_OF_SCOPE}" and an item, nor "cleared in vN: " and an item`,
      )
      continue
    }
    const problem = targetProblem(records, version, entry.target, kind)
    if (problem) errors.push(`${version.name} proposes reopening ${problem}`)
    else if (version.proposals.has(entry.target)) errors.push(`${version.name} proposes reopening ${entry.target} twice`)
    else version.proposals.set(entry.target, { kind, answer: null, answeredIn: null })
  }
}

function readRaised(records, version, entries, errors) {
  const highest = new Map()
  for (const id of records.findings.keys()) {
    const [, letter, number] = FINDING_ID.exec(id)
    highest.set(letter, Math.max(highest.get(letter) ?? 0, Number(number)))
  }
  for (const [index, entry] of entries.entries()) {
    const where = `${version.name}: raised[${index}]`
    if (!checkShape(entry, SHAPES.finding, where, errors)) continue
    const id = FINDING_ID.exec(entry.id)
    if (!id || PRINCIPLE_ID.test(entry.id)) {
      errors.push(`${where}'s id "${entry.id}" is not an area's letter and a number, such as B7`)
      continue
    }
    const earlier = records.findings.get(entry.id)
    if (earlier) {
      const by = earlier.raisedIn === version.number ? 'it' : `v${earlier.raisedIn}`
      errors.push(`${version.name} raises ${entry.id}, which ${by} already raised; an ID belongs to one finding for good`)
      continue
    }
    const [, letter, number] = id
    if (records.config && !records.config.areas.has(letter)) {
      errors.push(`${version.name} raises ${entry.id} in area ${letter}, which config.json does not declare`)
    }
    if (Number(number) <= (highest.get(letter) ?? 0)) {
      errors.push(
        `${version.name} raises ${entry.id}, numbered below ${letter}${highest.get(letter)}, which an earlier version raised; a new finding takes the next number in its area`,
      )
    }
    if (!KINDS.includes(entry.kind)) errors.push(`${version.name}: ${entry.id} has kind "${entry.kind}"; the kinds are ${KINDS.join(', ')}`)
    if (!SEVERITIES.includes(entry.severity)) {
      errors.push(`${version.name}: ${entry.id} has severity "${entry.severity}"; the severities are ${SEVERITIES.join(', ')}`)
    }
    records.findings.set(entry.id, {
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      severity: entry.severity,
      raisedIn: version.number,
      status: 'open',
      decided: false,
      entries: [],
    })
    version.raised.push(entry.id)
  }
}

function readRound(records, version, { name, data }, errors) {
  const round = { name, decisions: [] }
  version.rounds.push(round)
  if (!checkShape(data, SHAPES.round, name, errors)) return
  dated(records, name, data.date, errors)
  const answers = readAnswers(version, name, data.reopens ?? [], errors)
  const decided = readDecisions(records, version, round, data.decisions ?? [], answers, errors)
  const written = readPrinciples(records, name, data.principles ?? [], answers, errors)
  for (const [target, answer] of answers) {
    if (answer !== 'reopened') continue
    const { kind } = version.proposals.get(target)
    if (kind === 'finding' && !decided.has(target)) {
      errors.push(`${name} reopens ${target} but gives it no new decision; a reopened finding is decided again in the same round`)
    }
    if (kind === 'principle' && !written.has(target)) {
      errors.push(`${name} reopens ${target} but neither changes nor retires it; a reopened principle changes in the same round`)
    }
  }
}

function readAnswers(version, name, entries, errors) {
  const answers = new Map()
  for (const [index, entry] of entries.entries()) {
    const where = `${name}: reopens[${index}]`
    if (!checkShape(entry, SHAPES.answer, where, errors)) continue
    const proposal = version.proposals.get(entry.target)
    if (!proposal) errors.push(`${where} answers a proposal to reopen ${entry.target}, which ${version.name} does not make`)
    else if (!['reopened', 'kept'].includes(entry.answer)) errors.push(`${where}'s answer is "${entry.answer}"; it is reopened or kept`)
    else if (proposal.answer) errors.push(`${name} answers the proposal to reopen ${entry.target}, which ${proposal.answeredIn} answered`)
    else {
      proposal.answer = entry.answer
      proposal.answeredIn = name
      answers.set(entry.target, entry.answer)
    }
  }
  return answers
}

function readDecisions(records, version, round, entries, answers, errors) {
  const decided = new Set()
  const { name } = round
  for (const [index, entry] of entries.entries()) {
    if (!checkShape(entry, SHAPES.decision, `${name}: decisions[${index}]`, errors)) continue
    const finding = records.findings.get(entry.finding)
    if (!finding) {
      errors.push(`${name} decides ${entry.finding}, which no version up to ${version.label} raised`)
      continue
    }
    if (decided.has(finding.id)) {
      errors.push(`${name} decides ${finding.id} twice`)
      continue
    }
    decided.add(finding.id)
    const field = VERDICT_FIELDS[entry.verdict]
    if (!field) {
      errors.push(`${name}: ${finding.id}'s verdict is "${entry.verdict}"; it is ${either(VERDICTS)}`)
      continue
    }
    if (!has(entry, field)) errors.push(`${name}: ${finding.id} is ${entry.verdict} but gives no ${field}`)
    for (const other of Object.values(VERDICT_FIELDS)) {
      if (other !== field && has(entry, other)) errors.push(`${name}: ${finding.id} is ${entry.verdict}, so it gives ${field}, not ${other}`)
    }
    if (finding.status === 'obsolete') {
      errors.push(`${name} decides ${finding.id}, which is obsolete`)
      continue
    }
    if (answers.get(finding.id) === 'kept') {
      errors.push(`${name} keeps ${finding.id}'s decision against the proposal to reopen it, so it cannot decide it again`)
      continue
    }
    if (finding.decided && finding.status !== 'triggered' && !has(entry, 'reverses')) {
      errors.push(`${name} decides ${finding.id} again, which was ${finding.status}; a decision that changes an earlier one says why in reverses`)
    }
    if (!finding.decided && has(entry, 'reverses')) errors.push(`${name}: ${finding.id} gives reverses, but no earlier round decided it`)
    finding.status = entry.verdict
    finding.decided = true
    finding.entries = []
    round.decisions.push({ finding: finding.id, verdict: entry.verdict })
  }
  return decided
}

function readPrinciples(records, name, entries, answers, errors) {
  const written = new Set()
  const highest = Math.max(0, ...[...records.principles.keys()].map((id) => Number(PRINCIPLE_ID.exec(id)[1])))
  for (const [index, entry] of entries.entries()) {
    const where = `${name}: principles[${index}]`
    if (!checkShape(entry, SHAPES.principle, where, errors)) continue
    const id = PRINCIPLE_ID.exec(entry.id)
    if (!id) {
      errors.push(`${where}'s id "${entry.id}" is not P and a number, such as P3`)
      continue
    }
    if (written.has(entry.id)) {
      errors.push(`${name} writes ${entry.id} twice`)
      continue
    }
    written.add(entry.id)
    if (answers.get(entry.id) === 'kept') {
      errors.push(`${name} keeps ${entry.id} against the proposal to reopen it, so it cannot change it`)
      continue
    }
    const existing = records.principles.get(entry.id)
    if (has(entry, 'retired')) {
      const others = Object.keys(entry).filter((key) => key !== 'id' && key !== 'retired')
      if (others.length > 0) errors.push(`${name} retires ${entry.id} but also gives ${others.join(', ')}; a retirement gives only id and retired`)
      else if (!existing) errors.push(`${name} retires ${entry.id}, which no round has written`)
      else if (existing.retired) errors.push(`${name} retires ${entry.id}, which ${existing.retiredIn} retired`)
      else Object.assign(existing, { retired: true, retiredIn: name })
      continue
    }
    if (!has(entry, 'rule') || !has(entry, 'from')) {
      errors.push(`${name}: ${entry.id} gives no ${has(entry, 'rule') ? 'from' : 'rule'}; a principle gives its rule and the findings it comes from`)
      continue
    }
    if (existing?.retired) {
      errors.push(`${name} writes ${entry.id}, which ${existing.retiredIn} retired; an ID is never reused`)
      continue
    }
    if (existing && !has(entry, 'changed')) {
      errors.push(`${name} writes ${entry.id} again without changed; a change to a principle says why`)
      continue
    }
    if (!existing && has(entry, 'changed')) {
      errors.push(`${name}: ${entry.id} is new, so it gives no changed`)
      continue
    }
    if (!existing && Number(id[1]) <= highest) {
      errors.push(`${name} writes ${entry.id} as new, numbered below P${highest}; a new principle takes the next number`)
      continue
    }
    for (const from of entry.from) {
      const finding = records.findings.get(from)
      if (!finding) errors.push(`${name}: ${entry.id} comes from ${from}, which is not a finding`)
      else if (!SETTLED.has(finding.status)) {
        errors.push(`${name}: ${entry.id} comes from ${from}, which is ${finding.status}, not accepted, done, or regressed`)
      }
    }
    records.principles.set(entry.id, { id: entry.id, rule: entry.rule, from: entry.from, retired: false, retiredIn: null })
  }
  return written
}

function readProof(proof, where, errors, audit) {
  if (!isObject(proof)) {
    errors.push(`${where} is not an object`)
    return false
  }
  const shape = PROOF_SHAPES[proof.kind]
  if (!shape) {
    errors.push(`${where} has kind "${proof.kind}"; the kinds are ${Object.keys(PROOF_SHAPES).join(', ')}`)
    return false
  }
  if (proof.kind === 'eye' && audit === 'non-ui') {
    errors.push(`${where} is an eye proof, which only the UI audit's records hold: a non-UI finding is proved by a test, a search, a file's text, or JSON`)
    return false
  }
  if (!checkShape(proof, shape, where, errors)) return false
  if (proof.kind === 'search') {
    if (proof.before === proof.now) {
      errors.push(`${where} finds ${proof.now} lines at the audited commit and today; a search that cannot fail is refused`)
      return false
    }
    for (const pattern of proof.fixed ? [] : proof.patterns) {
      try {
        new RegExp(pattern)
      } catch (error) {
        errors.push(`${where}'s pattern ${JSON.stringify(pattern)} is not a regular expression: ${error.message}`)
        return false
      }
    }
  }
  if (proof.kind === 'json' && (proof.present ?? []).length + (proof.absent ?? []).length === 0) {
    errors.push(`${where} names no JSON pointer`)
    return false
  }
  return true
}

function readFix(records, version, { name, step, data }, errors) {
  const fix = { name, step, closed: [], partial: [] }
  version.fixes.push(fix)
  dated(records, name, data.date, errors)
  const seen = new Set()
  for (const [index, entry] of data.findings.entries()) {
    if (!checkShape(entry, SHAPES.entry, `${name}: findings[${index}]`, errors)) continue
    if (seen.has(entry.id)) {
      errors.push(`${name} names ${entry.id} twice`)
      continue
    }
    seen.add(entry.id)
    const finding = records.findings.get(entry.id)
    if (!finding) {
      errors.push(`${name} names ${entry.id}, which no version up to ${version.label} raised`)
      continue
    }
    if (!WORKABLE.has(finding.status)) {
      errors.push(`${name} works on ${entry.id}, which is ${finding.status} when the step begins; a step works only on an accepted or regressed finding`)
      continue
    }
    const given = entry.proofs ?? []
    const proofs = given.filter((proof, at) => readProof(proof, `${name}: ${entry.id}'s proofs[${at}]`, errors, records.audit))
    if (!has(entry, 'left') && given.length === 0) {
      errors.push(`${name} closes ${entry.id} without a proof; an entry that closes its finding has at least one, and one that does not says what is left`)
    }
    for (const earlier of entry.earlierSteps ?? []) {
      if (earlier === step) errors.push(`${name}: ${entry.id} names its own step among its earlierSteps`)
      else records.earlierSteps.push({ name, finding: entry.id, step: earlier })
    }
    finding.entries.push({ name, step, commit: version.commit, proofs })
    if (has(entry, 'left')) fix.partial.push(entry.id)
    else {
      finding.status = 'done'
      fix.closed.push(entry.id)
    }
  }
}

function finish(records, errors, complete) {
  for (const principle of records.principles.values()) {
    if (principle.retired) continue
    for (const from of principle.from) {
      const finding = records.findings.get(from)
      if (finding && !SETTLED.has(finding.status)) {
        errors.push(`${principle.id} comes from ${from}, which is now ${finding.status}; change the principle or retire it`)
      }
    }
  }
  // Each item a version proposed to bring back into scope stands as its latest answer left it.
  const answered = new Map()
  for (const version of records.versions) {
    for (const [target, proposal] of version.proposals) {
      if (proposal.kind === 'outOfScope') answered.set(target.slice(OUT_OF_SCOPE.length), proposal.answer)
    }
  }
  for (const [what, answer] of records.config ? answered : []) {
    const listed = records.config.outOfScope.has(what)
    if (answer === 'reopened' && listed) errors.push(`"${what}" was reopened, so it leaves config.json's outOfScope`)
    if (answer !== 'reopened' && !listed) errors.push(`a proposal names "${what}" out of scope, which config.json's outOfScope does not hold in those words`)
  }
  const stepsWithEntries = new Set()
  for (const version of records.versions) {
    for (const fix of version.fixes) for (const id of [...fix.closed, ...fix.partial]) stepsWithEntries.add(`${fix.step}\0${id}`)
  }
  for (const { name, finding, step } of records.earlierSteps) {
    if (stepsWithEntries.has(`${step}\0${finding}`)) {
      errors.push(`${name}: ${finding} names ${step} among its earlierSteps, but ${step} has an entry of its own for it`)
    }
  }
  if (!complete) return
  for (const finding of records.findings.values()) {
    if (UNFINISHED.has(finding.status)) {
      errors.push(`${finding.id} is still ${finding.status}; complete records have no finding open, accepted, regressed, or triggered`)
    }
  }
  const latest = records.versions.at(-1)
  for (const [target, proposal] of latest?.proposals ?? []) {
    if (!proposal.answer) errors.push(`${latest.name}'s proposal to reopen ${target} is still waiting for its answer`)
  }
}

export function checkRecords(files, { complete = false, audit = 'ui' } = {}) {
  const errors = []
  const read = readFiles(files, errors)
  const records = {
    audit,
    config: readConfig(read.config, errors),
    versions: [],
    findings: new Map(),
    principles: new Map(),
    earlierSteps: [],
    lastDated: null,
  }
  for (const number of read.rounds.keys()) {
    if (!read.audits.has(number)) errors.push(`v${number}'s verdicts have no v${number}.json`)
  }
  const fixes = readFixFiles(read, errors)
  const latest = Math.max(0, ...read.audits.keys())
  for (let number = 1; number <= latest; number++) {
    if (!read.audits.has(number)) {
      errors.push(`v${number}.json is missing; versions count from v1 without gaps`)
      break
    }
    const version = readAudit(records, number, read.audits.get(number), errors)
    for (const round of roundsOf(read.rounds.get(number), version, errors)) readRound(records, version, round, errors)
    for (const fix of fixes.filter((each) => each.data.version === number)) readFix(records, version, fix, errors)
  }
  if (latest === 0 && records.config) errors.push('the records hold no version; the first audit writes v1.json')
  finish(records, errors, complete)
  return { records, errors }
}

// Each proof of a finding that is done, or accepted or regressed with part of it fixed, since the decision
// or the regression that last started its life.
export function proofsToVerify(records) {
  const items = []
  for (const finding of records.findings.values()) {
    if (!SETTLED.has(finding.status)) continue
    for (const entry of finding.entries) {
      for (const proof of entry.proofs) items.push({ finding: finding.id, file: entry.name, commit: entry.commit, proof })
    }
  }
  return items
}

const escapeExpression = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function globExpression(glob) {
  let source = ''
  for (let index = 0; index < glob.length; index++) {
    if (glob[index] === '*' && glob[index + 1] === '*') {
      source += '.*'
      index++
    } else if (glob[index] === '*') source += '[^/]*'
    else if (glob[index] === '?') source += '[^/]'
    else source += escapeExpression(glob[index])
  }
  return new RegExp(`^${source}$`)
}

function matchesGlob(path, glob) {
  if (!glob) return true
  return globExpression(glob).test(glob.includes('/') ? path : path.slice(path.lastIndexOf('/') + 1))
}

// The lines matching any of the search's patterns, across the files under its paths, today when commit is
// null and otherwise at that commit.
function countLines(proof, look, commit) {
  const expressions = proof.patterns.map((pattern) => {
    const source = proof.fixed ? escapeExpression(pattern) : pattern
    return new RegExp(proof.word ? `(?<!\\w)(?:${source})(?!\\w)` : source)
  })
  const files = look.list(proof.paths, commit).filter((path) => matchesGlob(path, proof.glob))
  let count = 0
  for (const text of look.read(files, commit).values()) {
    if (text === null || text.includes('\0')) continue
    const lines = text.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    count += lines.filter((line) => expressions.some((expression) => expression.test(line))).length
  }
  return count
}

function declaresTest(source, title) {
  const escaped = (quote) => title.replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`)
  const literals = [`'${escaped("'")}'`, `"${escaped('"')}"`, `\`${escaped('`').replace(/\$\{/g, '\\${')}\``]
  return new RegExp(`\\b(?:test|it)\\s*\\(\\s*(?:${literals.map(escapeExpression).join('|')})`).test(source)
}

function parseJson(text) {
  if (text === null) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// A pointer holds when it resolves to a value that is not empty: not null, "", [], or {}.
function pointerHolds(document, pointer) {
  let value = document
  for (const raw of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(value) && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) value = value[Number(key)]
    else if (isObject(value) && has(value, key)) value = value[key]
    else return false
  }
  if (value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return !isObject(value) || Object.keys(value).length > 0
}

const jsonHolds = (proof, document) =>
  (proof.present ?? []).every((pointer) => pointerHolds(document, pointer)) &&
  !(proof.absent ?? []).some((pointer) => pointerHolds(document, pointer))

function verifyProof(proof, commit, look) {
  const today = (file) => look.read([file], null).get(file)
  const then = (file) => look.read([file], commit).get(file)
  if (proof.kind === 'test') {
    const source = today(proof.file)
    if (source === null) return ['names a file that does not exist']
    return declaresTest(source, proof.title) ? [] : ['is not declared there: no test( or it( in it carries that exact title']
  }
  if (proof.kind === 'search') {
    const problems = []
    const now = countLines(proof, look, null)
    if (now !== proof.now) problems.push(`finds ${now} matching ${now === 1 ? 'line' : 'lines'} today, where it says ${proof.now}`)
    const before = countLines(proof, look, commit)
    if (before !== proof.before) problems.push(`finds ${before} at ${commit}, where it says ${proof.before}`)
    return problems
  }
  if (proof.kind === 'text') {
    const source = today(proof.file)
    if (source === null) return ['names a file that does not exist']
    const missing = proof.holds.filter((text) => !source.includes(text))
    if (missing.length > 0) return missing.map((text) => `no longer holds ${JSON.stringify(text)}`)
    const earlier = then(proof.file)
    return earlier !== null && proof.holds.every((text) => earlier.includes(text)) ? [`already held at ${commit}, so it cannot fail on the defect`] : []
  }
  if (proof.kind === 'json') {
    const document = parseJson(today(proof.file))
    if (document === undefined) return ['names a file that does not exist or is not valid JSON']
    const problems = [
      ...(proof.present ?? []).filter((pointer) => !pointerHolds(document, pointer)).map((pointer) => `finds no value at ${JSON.stringify(pointer)}`),
      ...(proof.absent ?? []).filter((pointer) => pointerHolds(document, pointer)).map((pointer) => `still finds a value at ${JSON.stringify(pointer)}`),
    ]
    if (problems.length > 0) return problems
    const earlier = parseJson(then(proof.file))
    return earlier !== undefined && jsonHolds(proof, earlier) ? [`already held at ${commit}, so it cannot fail on the defect`] : []
  }
  return []
}

function describeProof(proof) {
  if (proof.kind === 'test') return `test "${proof.title}" in ${proof.file}`
  if (proof.kind === 'search') return `search for ${proof.patterns.map((pattern) => JSON.stringify(pattern)).join(', ')} in ${proof.paths.join(', ')}`
  if (proof.kind === 'json') return `JSON proof on ${proof.file}`
  if (proof.kind === 'text') return `text proof on ${proof.file}`
  return `${proof.kind} proof`
}

// look.list(paths, commit) gives the files under the paths, and look.read(paths, commit) a Map from each to
// its text, or null where there is none; commit is null for the files as they are today.
export function verifyProofs(items, look) {
  const errors = []
  for (const { finding, file, commit, proof } of items) {
    let problems
    try {
      problems = verifyProof(proof, commit, look)
    } catch (error) {
      problems = [`could not be checked: ${error.message}`]
    }
    for (const problem of problems) errors.push(`${file}: ${finding}'s ${describeProof(proof)} ${problem}`)
  }
  return errors
}

function tally(values, order) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return order
    .filter((key) => counts.has(key))
    .map((key) => `${counts.get(key)} ${key}`)
    .join(', ')
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function byId(left, right) {
  const [, leftLetter, leftNumber] = FINDING_ID.exec(left)
  const [, rightLetter, rightNumber] = FINDING_ID.exec(right)
  return compare(leftLetter, rightLetter) || Number(leftNumber) - Number(rightNumber)
}

export function summarize(records) {
  const { config, versions, findings, principles } = records
  const live = [...principles.values()].filter((principle) => !principle.retired).length
  const lines = [
    `${plural(findings.size, 'finding')} in ${plural(config.areas.size, 'area')}, ${plural(versions.length, 'version')}, ${plural(live, 'principle')}`,
  ]
  for (const version of versions) {
    const severities = tally(
      version.raised.map((id) => findings.get(id).severity),
      SEVERITIES,
    )
    const parts = [`raised ${version.raised.length}${severities ? ` (${severities})` : ''}`]
    if (version.rechecked.length > 0) {
      parts.push(`re-checked ${version.rechecked.length}: ${tally(version.rechecked.map((entry) => entry.outcome), OUTCOMES)}`)
    }
    if (version.proposals.size > 0) parts.push(plural(version.proposals.size, 'reopen proposal'))
    if (version.rounds.length > 0) {
      const verdicts = tally(version.rounds.flatMap((round) => round.decisions.map((decision) => decision.verdict)), VERDICTS)
      parts.push(`${plural(version.rounds.length, 'round')} of verdicts: ${verdicts || 'no decision'}`)
    }
    if (version.fixes.length > 0) {
      const closed = version.fixes.reduce((sum, fix) => sum + fix.closed.length, 0)
      const partial = version.fixes.reduce((sum, fix) => sum + fix.partial.length, 0)
      parts.push(`${plural(version.fixes.length, 'fix step')}: ${closed} closed${partial > 0 ? `, ${partial} in part` : ''}`)
    }
    lines.push(`${version.label} ${version.date} ${version.commit}: ${parts.join('; ')}`)
  }
  return lines
}

export function statusTable(records) {
  const rows = STATUSES.map((status) => [
    status,
    [...records.findings.values()]
      .filter((finding) => finding.status === status)
      .map((finding) => finding.id)
      .sort(byId),
  ]).filter(([, ids]) => ids.length > 0)
  const width = Math.max('status'.length, ...rows.map(([status]) => status.length))
  return [
    `${'status'.padEnd(width)}  count  findings`,
    ...rows.map(([status, ids]) => `${status.padEnd(width)}  ${String(ids.length).padStart(5)}  ${ids.join(' ')}`),
  ]
}

const TAG = /<[a-z][a-z0-9-]*((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=`]+))?)*)\s*\/?>/gi
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g

function attributes(html, wanted) {
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi, '$1$3')
  const found = []
  for (const [, list] of markup.matchAll(TAG)) {
    for (const [, name, ...values] of list.matchAll(ATTRIBUTE)) {
      if (wanted.includes(name.toLowerCase())) found.push([name.toLowerCase(), values.find((value) => value !== undefined) ?? ''])
    }
  }
  return found
}

// exists(path) answers whether a path the report refers to, relative to the report, exists.
export function checkReport(records, html, exists) {
  const latest = records.versions.at(-1)
  if (!latest) return ['the records have no version whose report could be checked']
  const errors = []
  const found = attributes(html, ['id', 'src', 'href'])
  const ids = new Set(found.filter(([name]) => name === 'id').map(([, value]) => value))
  for (const id of latest.raised) {
    if (!ids.has(id)) errors.push(`${id} was raised in ${latest.label}, but the report has no element with id="${id}"`)
  }
  for (const { finding } of latest.rechecked) {
    if (!new RegExp(`\\b${finding}\\b`).test(html)) errors.push(`${finding} was re-checked in ${latest.label}, but the report never names it`)
  }
  for (const [, target] of found.filter(([name]) => name !== 'id')) {
    if (target.startsWith('#')) {
      if (!ids.has(decodeURIComponent(target.slice(1)))) errors.push(`the link "${target}" points at no element of the report`)
      continue
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue
    const path = decodeURI(target.split(/[?#]/)[0])
    if (path && !exists(path)) errors.push(`the report refers to ${target}, which does not exist`)
  }
  return errors
}
