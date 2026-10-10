import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { commandPlan, runCheck, runChecks } from './check-records.mjs'
import { checkRecords, checkReport, FORMAT, proofsToVerify, statusTable, summarize, verifyProofs } from './records.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'check-records.mjs')

// Two versions: A1 is done, B1 deferred, B2 accepted with part of it fixed, and B3 rejected.
function valid({ audited = 'ac386b3', later = '1999623' } = {}) {
  return {
    'config.json': {
      format: FORMAT,
      standards: {
        designAuthority: '`docs/DESIGN.md`, The App',
        high: 'loses work or misleads the user',
        medium: 'friction met on every visit',
        low: 'polish and code hygiene',
      },
      areas: [
        { letter: 'A', name: 'Layout', covers: 'the frame every page shares' },
        { letter: 'B', name: 'Words', covers: 'what the app says' },
      ],
      outOfScope: [{ what: 'Editing a value in place.', source: '`docs/DESIGN.md`, Left Out' }],
    },
    'v1.json': {
      date: '2026-10-08',
      commit: audited,
      scope: 'Every screen and state',
      report: 'docs/audit/ui/course/reports/v1/review.html',
      raised: [
        {
          id: 'A1',
          title: 'Pages scroll as one long document',
          kind: 'design',
          severity: 'high',
          where: 'every course page',
          problem: 'the outline page is 19,057 px tall and its actions scroll away',
          proposal: 'only the content pane scrolls',
        },
        {
          id: 'B1',
          title: 'States are status words in capitals',
          kind: 'defect',
          severity: 'medium',
          where: 'the rail',
          problem: 'eleven states in 11 px monospace capitals',
          proposal: 'one chip per state',
        },
        {
          id: 'B2',
          title: 'The run panel is a terminal',
          kind: 'defect',
          severity: 'low',
          where: 'the run panel',
          problem: 'raw output lines',
          proposal: 'progress with an expected time',
        },
      ],
      cleared: ["The journal's format: one parser reads every line."],
    },
    'v1-verdicts.json': {
      date: '2026-10-08',
      by: 'the maintainer',
      decisions: [
        { finding: 'A1', verdict: 'accepted', doneWhen: 'the window stays 900 px tall on the outline' },
        { finding: 'B1', verdict: 'deferred', trigger: 'when the rail is redesigned' },
        { finding: 'B2', verdict: 'accepted', doneWhen: 'a run shows its steps and its expected time' },
      ],
      principles: [{ id: 'P1', rule: 'The window never scrolls; only the content pane does.', from: ['A1'] }],
    },
    'fixes/SHELL.json': {
      version: 1,
      date: '2026-10-09',
      findings: [
        {
          id: 'A1',
          departs: 'the wait line scrolls with the step',
          proofs: [
            { kind: 'test', file: 'tests/course.spec.ts', title: 'the window never scrolls' },
            { kind: 'search', patterns: ['min-h-screen'], paths: ['src'], before: 2, now: 0 },
            { kind: 'json', file: 'package.json', present: ['/description', '/devDependencies/typescript'], absent: ['/dependencies/typescript'] },
          ],
        },
        {
          id: 'B2',
          earlierSteps: ['DESIGN'],
          proofs: [{ kind: 'text', file: 'src/run.tsx', holds: ['aria-live'] }],
          left: 'Nothing proves the expected time.',
        },
      ],
    },
    'v2.json': {
      date: '2026-11-02',
      commit: later,
      scope: 'Every screen and state',
      report: 'docs/audit/ui/course/reports/v2/review.html',
      rechecked: [
        { finding: 'A1', outcome: 'holds', observed: 'the frame spec passes' },
        { finding: 'B1', outcome: 'waiting', observed: 'the rail is unchanged' },
        { finding: 'B2', outcome: 'open', observed: 'the panel still gives no expected time' },
      ],
      reopens: [{ target: 'out of scope: Editing a value in place.', evidence: 'two teachers asked for it', recommendation: 'keep it out' }],
      raised: [
        {
          id: 'B3',
          title: "Refusals are the engine's sentences",
          kind: 'defect',
          severity: 'low',
          where: 'every refusal',
          problem: 'terminal nouns beside a button',
          proposal: "the teacher's words",
        },
      ],
    },
    'v2-verdicts.json': {
      date: '2026-11-03',
      by: 'the maintainer',
      decisions: [{ finding: 'B3', verdict: 'rejected', reason: "the engine's words are what teachers search for" }],
      reopens: [{ target: 'out of scope: Editing a value in place.', answer: 'kept', why: 'two requests are not a workflow' }],
    },
  }
}

// A third version that proposes reopening the rejected B3, for the tests that answer it.
function withV3(records) {
  records['v3.json'] = {
    date: '2026-12-01',
    commit: '2a7f1c0',
    scope: 'Every screen and state',
    report: 'docs/audit/ui/course/reports/v3/review.html',
    rechecked: [
      { finding: 'A1', outcome: 'holds', observed: 'the frame spec passes' },
      { finding: 'B1', outcome: 'waiting', observed: 'the rail is unchanged' },
      { finding: 'B2', outcome: 'open', observed: 'the panel still gives no expected time' },
    ],
    reopens: [{ target: 'B3', evidence: 'a pilot teacher could not act on a refusal', recommendation: 'reopen, and translate them' }],
  }
  return records
}

const filesOf = (records) => Object.entries(records).map(([name, data]) => ({ name, text: JSON.stringify(data, null, 2) }))

function variant(change) {
  const records = valid()
  change(records)
  return records
}

function errorsOf(records, options) {
  return checkRecords(filesOf(records), options).errors
}

function assertRefused(records, expected, options) {
  const errors = errorsOf(records, options)
  assert.ok(
    errors.some((error) => error.includes(expected)),
    `expected an error naming ${JSON.stringify(expected)}, got:\n${errors.join('\n') || '(none)'}`,
  )
}

const temporaryRoots = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'app-slop-audit-'))
  temporaryRoots.push(root)
  return root
}

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function writeRecords(root, records, folder = 'docs/audit/ui/course') {
  for (const [name, data] of Object.entries(records)) write(root, `${folder}/${name}`, `${JSON.stringify(data, null, 2)}\n`)
}

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

// A repository whose audited commit holds the defects, with today's files fixing them, and its records.
function project(change = () => {}) {
  const root = temporaryRoot()
  git(root, 'init', '-q')
  write(root, 'src/page.tsx', '<main className="min-h-screen">\n  <div className="min-h-screen" />\n</main>\n')
  write(root, 'src/run.tsx', 'export const Run = () => null\n')
  write(root, 'package.json', `${JSON.stringify({ description: '', dependencies: { typescript: '^7' } })}\n`)
  git(root, 'add', 'src/page.tsx', 'src/run.tsx', 'package.json')
  git(root, '-c', 'user.name=Audit', '-c', 'user.email=audit@example.com', 'commit', '-q', '--no-verify', '-m', 'audited')
  const audited = git(root, 'rev-parse', '--short', 'HEAD')
  write(root, 'src/page.tsx', '<main className="h-dvh">\n</main>\n')
  write(root, 'src/run.tsx', 'export const Run = () => <p aria-live="polite" />\n')
  write(root, 'tests/course.spec.ts', "test('the window never scrolls', async () => {})\n")
  write(root, 'package.json', `${JSON.stringify({ description: 'Plans courses', devDependencies: { typescript: '^7' } })}\n`)
  const records = valid({ audited, later: audited })
  change(records, audited)
  writeRecords(root, records)
  return { root, audited }
}

test('sound records pass, and the summary gives each version and where each finding stands', () => {
  const { records, errors } = checkRecords(filesOf(valid()))
  assert.deepEqual(errors, [])
  assert.deepEqual(summarize(records), [
    '4 findings in 2 areas, 2 versions, 1 principle',
    'v1 2026-10-08 ac386b3: raised 3 (1 high, 1 medium, 1 low); 1 round of verdicts: 2 accepted, 1 deferred; 1 fix step: 1 closed, 1 in part',
    'v2 2026-11-02 1999623: raised 1 (1 low); re-checked 3: 1 open, 1 holds, 1 waiting; 1 reopen proposal; 1 round of verdicts: 1 rejected',
  ])
  assert.deepEqual(statusTable(records), [
    'status    count  findings',
    'accepted      1  B2',
    'done          1  A1',
    'deferred      1  B1',
    'rejected      1  B3',
  ])
})

const refusals = [
  ['a file the format does not name', (r) => (r['notes.json'] = {}), 'notes.json does not belong in the records'],
  ['there is no config', (r) => delete r['config.json'], 'there is no config.json'],
  ['the format is another', (r) => (r['config.json'].format = 'app-slop-audit records 2'), 'format is "app-slop-audit records 2"'],
  ['a severity is not defined', (r) => delete r['config.json'].standards.high, "config.json's standards give no high"],
  ['the config has a key the format does not name', (r) => (r['config.json'].owner = 'me'), 'has "owner", which the format does not name'],
  ['an area takes the principles\' letter', (r) => (r['config.json'].areas[1].letter = 'P'), 'other than P, which principles use'],
  ['an area is declared twice', (r) => (r['config.json'].areas[1].letter = 'A'), 'declares area A twice'],
  [
    'a version is missing',
    (r) => {
      r['v3.json'] = r['v2.json']
      delete r['v2.json']
    },
    'v2.json is missing',
  ],
  ['a round belongs to no version', (r) => (r['v3-verdicts.json'] = { date: '2026-12-01', by: 'the maintainer' }), "v3's verdicts have no v3.json"],
  [
    "a version's first round carries a number",
    (r) => {
      r['v1-verdicts-1.json'] = r['v1-verdicts.json']
      delete r['v1-verdicts.json']
    },
    'should be named v1-verdicts.json',
  ],
  [
    'a second round has no first',
    (r) => {
      r['v2-verdicts-2.json'] = r['v2-verdicts.json']
      delete r['v2-verdicts.json']
    },
    'v2-verdicts-2.json has no v2-verdicts.json before it',
  ],
  ['a date is not real', (r) => (r['v2.json'].date = '2026-13-02'), "v2.json's date is not a real date"],
  ['a version is dated before what it follows', (r) => (r['v2.json'].date = '2026-10-08'), 'v2.json is dated 2026-10-08, before fixes/SHELL.json'],
  ["a fix step is dated before its version's verdicts", (r) => (r['fixes/SHELL.json'].date = '2026-10-07'), 'fixes/SHELL.json is dated 2026-10-07, before v1-verdicts.json'],
  ['a commit is not a hash', (r) => (r['v1.json'].commit = 'HEAD'), "v1.json's commit is not a commit hash"],
  [
    'a raised finding misspells a key',
    (r) => {
      const finding = r['v1.json'].raised[0]
      finding.serverity = finding.severity
      delete finding.severity
    },
    'has "serverity", which the format does not name',
  ],
  ["a finding's id is not an area's letter and a number", (r) => (r['v1.json'].raised[0].id = 'a1'), 'id "a1" is not an area\'s letter and a number'],
  ['a finding belongs to no declared area', (r) => (r['v2.json'].raised[0].id = 'C1'), 'raises C1 in area C, which config.json does not declare'],
  ['an ID is raised twice', (r) => (r['v2.json'].raised[0].id = 'B1'), 'v2.json raises B1, which v1 already raised'],
  [
    'a new finding is numbered below an earlier one',
    (r) => r['v1.json'].raised.push({ ...r['v1.json'].raised[2], id: 'B5' }),
    'v2.json raises B3, numbered below B5',
  ],
  ['a kind is unknown', (r) => (r['v1.json'].raised[1].kind = 'bug'), 'B1 has kind "bug"'],
  ['a severity is unknown', (r) => (r['v1.json'].raised[1].severity = 'urgent'), 'B1 has severity "urgent"'],
  [
    'a later version skips a re-check',
    (r) => (r['v2.json'].rechecked = r['v2.json'].rechecked.filter((entry) => entry.finding !== 'A1')),
    'v2.json does not re-check A1, which was done',
  ],
  [
    "a re-check's outcome does not fit where the finding stood",
    (r) => (r['v2.json'].rechecked[0].outcome = 'waiting'),
    're-checks A1 as "waiting"; a finding that was done is re-checked as holds, regressed, or obsolete',
  ],
  [
    'a re-check names a finding no earlier version raised',
    (r) => r['v2.json'].rechecked.push({ finding: 'A9', outcome: 'open', observed: 'nothing' }),
    're-checks A9, which no earlier version raised',
  ],
  ['a finding is re-checked twice', (r) => r['v2.json'].rechecked.push(r['v2.json'].rechecked[0]), 're-checks A1 twice'],
  ["a proposal's target is not one the format names", (r) => (r['v2.json'].reopens[0].target = 'the rail'), 'target "the rail" is neither'],
  ['a proposal reopens a finding no version raised', (r) => (r['v2.json'].reopens[0].target = 'B9'), 'proposes reopening B9, which no earlier version raised'],
  [
    'a proposal reopens what was not cleared in those words',
    (r) => (r['v2.json'].reopens[0].target = 'cleared in v1: The journal'),
    '"The journal", which v1 did not clear in those words',
  ],
  [
    'a proposal names an item the config does not leave out',
    (r) => {
      r['v2.json'].reopens[0].target = 'out of scope: Deleting a course.'
      r['v2-verdicts.json'].reopens[0].target = 'out of scope: Deleting a course.'
    },
    'a proposal names "Deleting a course." out of scope, which config.json\'s outOfScope does not hold in those words',
  ],
  [
    'an item brought back into scope is still left out',
    (r) => (r['v2-verdicts.json'].reopens[0].answer = 'reopened'),
    '"Editing a value in place." was reopened, so it leaves config.json\'s outOfScope',
  ],
  ['an answer names a proposal the version does not make', (r) => (r['v2-verdicts.json'].reopens[0].target = 'P1'), 'answers a proposal to reopen P1, which v2.json does not make'],
  ['an answer is neither reopened nor kept', (r) => (r['v2-verdicts.json'].reopens[0].answer = 'maybe'), 'answer is "maybe"'],
  [
    'a decision names a finding no version raised',
    (r) => r['v1-verdicts.json'].decisions.push({ finding: 'A9', verdict: 'accepted', doneWhen: 'never' }),
    'decides A9, which no version up to v1 raised',
  ],
  ['a verdict is unknown', (r) => (r['v1-verdicts.json'].decisions[0].verdict = 'approved'), 'verdict is "approved"'],
  ['an accepted finding says nothing of when it is done', (r) => delete r['v1-verdicts.json'].decisions[0].doneWhen, 'A1 is accepted but gives no doneWhen'],
  ["a verdict gives another verdict's field", (r) => (r['v1-verdicts.json'].decisions[0].reason = 'it is fine'), 'A1 is accepted, so it gives doneWhen, not reason'],
  [
    'a decision changes an earlier one without saying why',
    (r) => r['v2-verdicts.json'].decisions.push({ finding: 'B2', verdict: 'rejected', reason: 'the panel is fine' }),
    'decides B2 again, which was accepted; a decision that changes an earlier one says why in reverses',
  ],
  ['a first decision claims to reverse one', (r) => (r['v1-verdicts.json'].decisions[0].reverses = 'it changed'), 'A1 gives reverses, but no earlier round decided it'],
  [
    'a principle comes from a rejected finding',
    (r) => (r['v2-verdicts.json'].principles = [{ id: 'P2', rule: 'Refusals keep their words.', from: ['B3'] }]),
    'P2 comes from B3, which is rejected, not accepted, done, or regressed',
  ],
  ['a principle comes from no finding', (r) => (r['v1-verdicts.json'].principles[0].from = ['A9']), 'P1 comes from A9, which is not a finding'],
  [
    'a principle is written again without saying why',
    (r) => (r['v2-verdicts.json'].principles = [{ id: 'P1', rule: 'The window scrolls.', from: ['A1'] }]),
    'writes P1 again without changed',
  ],
  [
    'a new principle is numbered below an earlier one',
    (r) => {
      r['v1-verdicts.json'].principles.push({ id: 'P3', rule: 'Runs say how long they take.', from: ['B2'] })
      r['v2-verdicts.json'].principles = [{ id: 'P2', rule: 'States are chips.', from: ['A1'] }]
    },
    'writes P2 as new, numbered below P3',
  ],
  [
    'a retirement gives more than its reason',
    (r) => (r['v2-verdicts.json'].principles = [{ id: 'P1', retired: 'the frame changed', rule: 'gone' }]),
    'retires P1 but also gives rule',
  ],
  ['a fix step acts on a version that does not exist', (r) => (r['fixes/SHELL.json'].version = 3), 'fixes/SHELL.json acts on v3, which has no v3.json'],
  [
    'a fix step names a finding no version raised',
    (r) => r['fixes/SHELL.json'].findings.push({ id: 'A9', proofs: [{ kind: 'eye', compared: 'x', screenshot: 'a.png' }] }),
    'names A9, which no version up to v1 raised',
  ],
  [
    'a fix step works on a deferred finding',
    (r) => r['fixes/SHELL.json'].findings.push({ id: 'B1', proofs: [{ kind: 'eye', compared: 'x', screenshot: 'a.png' }] }),
    'works on B1, which is deferred when the step begins',
  ],
  ['a fix step closes a finding without a proof', (r) => (r['fixes/SHELL.json'].findings[0].proofs = []), 'closes A1 without a proof'],
  ['a fix step names a finding twice', (r) => r['fixes/SHELL.json'].findings.push(r['fixes/SHELL.json'].findings[0]), 'names A1 twice'],
  ['a proof has a kind the format does not name', (r) => (r['fixes/SHELL.json'].findings[0].proofs[0].kind = 'screenshot'), 'has kind "screenshot"'],
  [
    'a proof misspells a key',
    (r) => {
      const proof = r['fixes/SHELL.json'].findings[0].proofs[0]
      proof.titel = proof.title
      delete proof.title
    },
    'has "titel", which the format does not name',
  ],
  ['a search cannot fail', (r) => (r['fixes/SHELL.json'].findings[0].proofs[1].now = 2), 'a search that cannot fail is refused'],
  [
    "a search's pattern is not a regular expression",
    (r) => (r['fixes/SHELL.json'].findings[0].proofs[1].patterns = ['min-h-[screen']),
    'is not a regular expression',
  ],
  [
    "a proof's file is outside the project",
    (r) => (r['fixes/SHELL.json'].findings[0].proofs[0].file = '../other/course.spec.ts'),
    "file is not a path inside the project",
  ],
  [
    'a JSON proof names no pointer',
    (r) => Object.assign(r['fixes/SHELL.json'].findings[0].proofs[2], { present: [], absent: [] }),
    'names no JSON pointer',
  ],
  ['a JSON pointer does not start at the root', (r) => (r['fixes/SHELL.json'].findings[0].proofs[2].present = ['description']), 'present is not a list of JSON pointers'],
  ['a step names itself among its earlier steps', (r) => (r['fixes/SHELL.json'].findings[1].earlierSteps = ['SHELL']), 'B2 names its own step among its earlierSteps'],
  [
    'an earlier step has an entry of its own',
    (r) => {
      r['fixes/FOUNDATION.json'] = { version: 1, date: '2026-10-09', findings: [{ id: 'B2', left: 'the panel is only started' }] }
      r['fixes/SHELL.json'].findings[1].earlierSteps = ['FOUNDATION']
    },
    'B2 names FOUNDATION among its earlierSteps, but FOUNDATION has an entry of its own for it',
  ],
]

for (const [name, change, expected] of refusals) {
  test(`refused when ${name}`, () => assertRefused(variant(change), expected))
}

test("an eye proof belongs to the UI audit's records, and a non-UI audit's refuse it", () => {
  const records = variant((r) => r['fixes/SHELL.json'].findings[0].proofs.push({ kind: 'eye', compared: 'the outline with its mockup', screenshot: 'docs/proof/A1.png' }))
  assert.deepEqual(errorsOf(records), [])
  assert.deepEqual(errorsOf(records, { audit: 'non-ui' }), [
    "fixes/SHELL.json: A1's proofs[3] is an eye proof, which only the UI audit's records hold: a non-UI finding is proved by a test, a search, a file's text, or JSON",
  ])
})

test('a records file that is not JSON is refused by name', () => {
  const files = filesOf(valid()).map((file) => (file.name === 'v2.json' ? { ...file, text: '{ "date": ' } : file))
  const { errors } = checkRecords(files)
  assert.ok(errors.some((error) => error.startsWith('v2.json is not valid JSON')), errors.join('\n'))
})

test('complete records have no finding open, accepted, regressed, or triggered, and no proposal waiting', () => {
  assertRefused(valid(), 'B2 is still accepted', { complete: true })
  const settled = variant((r) => r['v2-verdicts.json'].decisions.push({ finding: 'B2', verdict: 'rejected', reason: 'no', reverses: 'the panel is fine' }))
  assert.deepEqual(errorsOf(settled, { complete: true }), [])
  const waiting = withV3(settled)
  waiting['v3.json'].rechecked = waiting['v3.json'].rechecked.filter((entry) => entry.finding !== 'B2')
  assertRefused(waiting, "v3.json's proposal to reopen B3 is still waiting for its answer", { complete: true })
  assert.deepEqual(errorsOf(waiting), [])
})

test('a done finding found regressed is closed again by a later step, whose proofs alone are then verified', () => {
  const records = variant((r) => {
    r['v2.json'].rechecked[0] = { finding: 'A1', outcome: 'regressed', observed: 'the outline scrolls again' }
    r['fixes/SPECS.json'] = {
      version: 2,
      date: '2026-11-04',
      findings: [{ id: 'A1', proofs: [{ kind: 'test', file: 'tests/course.spec.ts', title: 'the window stays put' }] }],
    }
  })
  const { records: read, errors } = checkRecords(filesOf(records))
  assert.deepEqual(errors, [])
  assert.equal(read.findings.get('A1').status, 'done')
  const proofs = proofsToVerify(read).filter((item) => item.finding === 'A1')
  assert.deepEqual(
    proofs.map((item) => [item.file, item.commit, item.proof.title]),
    [['fixes/SPECS.json', '1999623', 'the window stays put']],
  )
})

test('a decision starts a finding again: a done finding rejected later has no proofs to verify', () => {
  const records = variant((r) => {
    r['v2-verdicts.json'].decisions.push({ finding: 'A1', verdict: 'rejected', reason: 'the frame scrolls', reverses: 'the phone layout needs it' })
    r['v2-verdicts.json'].principles = [{ id: 'P1', retired: 'the window scrolls on a phone' }]
  })
  const { records: read, errors } = checkRecords(filesOf(records))
  assert.deepEqual(errors, [])
  assert.equal(read.findings.get('A1').status, 'rejected')
  assert.deepEqual(proofsToVerify(read).map((item) => item.finding), ['B2'])
})

test('a principle whose finding is rejected later must change or retire', () => {
  assertRefused(
    variant((r) => r['v2-verdicts.json'].decisions.push({ finding: 'A1', verdict: 'rejected', reason: 'no', reverses: 'yes' })),
    'P1 comes from A1, which is now rejected; change the principle or retire it',
  )
})

test('a triggered finding is decided again without reverses', () => {
  const triggered = variant((r) => (r['v2.json'].rechecked[1] = { finding: 'B1', outcome: 'triggered', observed: 'the rail was redesigned' }))
  assertRefused(triggered, 'B1 is still triggered', { complete: true })
  triggered['v2-verdicts.json'].decisions.push({ finding: 'B1', verdict: 'accepted', doneWhen: 'every state is a chip' })
  const { records, errors } = checkRecords(filesOf(triggered))
  assert.deepEqual(errors, [])
  assert.equal(records.findings.get('B1').status, 'accepted')
})

test('a rejected finding is left alone by later versions', () => {
  const records = withV3(valid())
  records['v3.json'].rechecked.push({ finding: 'B3', outcome: 'open', observed: 'still terminal nouns' })
  assertRefused(records, 'v3.json re-checks B3, which is rejected')
})

test('a reopened finding is decided again in the same round, and a kept one is not', () => {
  const reopened = withV3(valid())
  reopened['v3-verdicts.json'] = {
    date: '2026-12-02',
    by: 'the maintainer',
    reopens: [{ target: 'B3', answer: 'reopened', why: 'the pilot showed the cost' }],
    decisions: [{ finding: 'B3', verdict: 'accepted', doneWhen: 'every refusal reads in the teacher\'s words', reverses: 'the pilot' }],
  }
  assert.deepEqual(errorsOf(reopened), [])
  const undecided = structuredClone(reopened)
  undecided['v3-verdicts.json'].decisions = []
  assertRefused(undecided, 'v3-verdicts.json reopens B3 but gives it no new decision')
  const kept = structuredClone(reopened)
  kept['v3-verdicts.json'].reopens[0].answer = 'kept'
  assertRefused(kept, "keeps B3's decision against the proposal to reopen it")
})

test('a reopened principle changes in the same round', () => {
  const records = withV3(valid())
  records['v3.json'].reopens = [{ target: 'P1', evidence: 'phones need the page to scroll', recommendation: 'scope it to wide screens' }]
  records['v3-verdicts.json'] = {
    date: '2026-12-02',
    by: 'the maintainer',
    reopens: [{ target: 'P1', answer: 'reopened', why: 'phones' }],
    principles: [{ id: 'P1', rule: 'On a wide screen the window never scrolls.', from: ['A1'], changed: 'phones scroll the page' }],
  }
  assert.deepEqual(errorsOf(records), [])
  records['v3-verdicts.json'].principles = []
  assertRefused(records, 'reopens P1 but neither changes nor retires it')
})

test('a proposal must be answered before the next version', () => {
  const records = withV3(valid())
  records['v4.json'] = { ...records['v3.json'], date: '2027-01-05', reopens: [] }
  assertRefused(records, 'v3.json proposes reopening B3, and no round answered it before v4')
})

function fakeLook(today, then) {
  const at = (commit) => (commit === null ? today : then)
  return {
    knows: () => true,
    list: (paths, commit) => Object.keys(at(commit)).filter((path) => paths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))),
    read: (paths, commit) => new Map(paths.map((path) => [path, at(commit)[path] ?? null])),
  }
}

const item = (proof) => ({ finding: 'B6', file: 'fixes/WORDS.json', commit: 'ac386b3', proof })

test('a search counts matching lines, as whole words when asked, in the files its glob names', () => {
  const look = fakeLook(
    { 'src/a.tsx': 'stale state\nunstale\n', 'src/a.ts': 'stale\n', 'src/b.ts': 'a.b\naxb\n' },
    { 'src/a.tsx': 'stale\nstale\nstale\n', 'src/a.ts': 'stale\n', 'src/b.ts': 'axb\n' },
  )
  const search = (fields) => item({ kind: 'search', paths: ['src'], ...fields })
  assert.deepEqual(verifyProofs([search({ patterns: ['stale'], word: true, glob: '*.tsx', before: 3, now: 1 })], look), [])
  assert.deepEqual(verifyProofs([search({ patterns: ['stale'], glob: '*.tsx', before: 3, now: 1 })], look), [
    'fixes/WORDS.json: B6\'s search for "stale" in src finds 2 matching lines today, where it says 1',
  ])
  assert.deepEqual(verifyProofs([search({ patterns: ['stale'], word: true, before: 3, now: 2 })], look), [
    'fixes/WORDS.json: B6\'s search for "stale" in src finds 4 at ac386b3, where it says 3',
  ])
  assert.deepEqual(verifyProofs([search({ patterns: ['a.b'], fixed: true, paths: ['src/b.ts'], before: 0, now: 1 })], look), [])
  assert.equal(verifyProofs([search({ patterns: ['a.b'], paths: ['src/b.ts'], before: 0, now: 1 })], look).length, 2)
})

test("a test is found by its exact title, whichever quotes declare it", () => {
  const look = fakeLook({ 't.spec.ts': 'it("the user\'s \\"draft\\" stays", () => {})\ntest.skip(\'skipped\', () => {})\n' }, {})
  const declared = (title) => verifyProofs([item({ kind: 'test', file: 't.spec.ts', title })], look)
  assert.deepEqual(declared('the user\'s "draft" stays'), [])
  assert.deepEqual(declared('skipped'), [
    'fixes/WORDS.json: B6\'s test "skipped" in t.spec.ts is not declared there: no test( or it( in it carries that exact title',
  ])
  assert.deepEqual(verifyProofs([item({ kind: 'test', file: 'gone.spec.ts', title: 'x' })], look), [
    'fixes/WORDS.json: B6\'s test "x" in gone.spec.ts names a file that does not exist',
  ])
})

test('every proof of a done or partly fixed finding is verified against the files today and at the audited commit', () => {
  const { root } = project()
  write(root, 'docs/audit/ui/course/.DS_Store', 'not a records file')
  const { errors, verified } = runCheck({ root, audit: 'ui', app: 'course' })
  assert.deepEqual(errors, [])
  assert.equal(verified, 4)
})

const proofRefusals = [
  ['a search finds another count today', (r) => (r['fixes/SHELL.json'].findings[0].proofs[1].now = 1), () => 'finds 0 matching lines today, where it says 1'],
  ['a search finds another count at the audited commit', (r) => (r['fixes/SHELL.json'].findings[0].proofs[1].before = 3), (audited) => `finds 2 at ${audited}, where it says 3`],
  ['a test is no longer declared', (r) => (r['fixes/SHELL.json'].findings[0].proofs[0].title = 'the window stays put'), () => 'is not declared there'],
  ["a partly fixed finding's text is gone", (r) => (r['fixes/SHELL.json'].findings[1].proofs[0].holds = ['aria-busy']), () => 'no longer holds "aria-busy"'],
  ['a text already held at the audited commit', (r) => (r['fixes/SHELL.json'].findings[1].proofs[0].holds = ['export const Run']), (audited) => `already held at ${audited}`],
  ['a JSON pointer finds no value', (r) => (r['fixes/SHELL.json'].findings[0].proofs[2].present = ['/keywords']), () => 'finds no value at "/keywords"'],
  [
    'a JSON proof already held at the audited commit',
    (r) => Object.assign(r['fixes/SHELL.json'].findings[0].proofs[2], { present: [], absent: ['/keywords'] }),
    (audited) => `already held at ${audited}`,
  ],
  ['a version names a commit the repository lacks', (r) => (r['v2.json'].commit = 'abcdef0'), () => "v2.json's commit abcdef0 is not a commit of this repository"],
]

for (const [name, change, expected] of proofRefusals) {
  test(`a proof is refused when ${name}`, () => {
    const { root, audited } = project(change)
    const { errors } = runCheck({ root, audit: 'ui', app: 'course' })
    assert.ok(errors.some((error) => error.includes(expected(audited))), errors.join('\n') || '(none)')
  })
}

test('an empty value counts as none: a description that was "" did not hold at the audited commit', () => {
  const { root } = project((r) => Object.assign(r['fixes/SHELL.json'].findings[0].proofs[2], { present: ['/description'], absent: [] }))
  assert.deepEqual(runCheck({ root, audit: 'ui', app: 'course' }).errors, [])
})

const REPORT =
  '<a href="#B3">B3</a><section class="finding" id="B3"><img src="shots/rail.png"></section><ul><li>A1 holds</li><li>B1 waiting</li><li>B2 open</li></ul>'

function report(body) {
  const { records } = checkRecords(filesOf(valid()))
  return checkReport(records, `<!doctype html><html><body>${body}</body></html>`, (path) => path === 'shots/rail.png')
}

test('the report holds every finding the latest version raised or re-checked, and what it links to exists', () => {
  assert.deepEqual(report(REPORT), [])
  assert.deepEqual(report(`${REPORT}<a href="https://example.com">out</a><img src="data:image/png;base64,AA==">`), [])
})

test('the report is refused when it leaves out a new finding', () => {
  assert.deepEqual(report(REPORT.replace('id="B3"', 'id="b3"')), [
    'B3 was raised in v2, but the report has no element with id="B3"',
    'the link "#B3" points at no element of the report',
  ])
})

test('the report is refused when it never names a re-checked finding', () => {
  assert.deepEqual(report(REPORT.replace('<li>A1 holds</li>', '')), ['A1 was re-checked in v2, but the report never names it'])
})

test('the report is refused when an image or an anchor it refers to is missing', () => {
  assert.deepEqual(report(`${REPORT}<img src="shots/gone.png"><a href="#nowhere">x</a>`), [
    'the report refers to shots/gone.png, which does not exist',
    'the link "#nowhere" points at no element of the report',
  ])
})

test('a data attribute named like an id does not count as one', () => {
  const errors = report(REPORT.replace('id="B3"', 'data-id="B3"'))
  assert.ok(errors.includes('B3 was raised in v2, but the report has no element with id="B3"'), errors.join('\n'))
})

test('an id or a link written out in a code sample, a script, or a comment is text, not markup', () => {
  const text = [
    '<pre>&lt;section id="B3"&gt; &lt;Link href="/courses/new"&gt;New course&lt;/Link&gt;</pre>',
    '<script>const shot = \'<img src="shots/gone.png">\'</script>',
    '<!-- <a href="#nowhere">x</a> -->',
  ].join('')
  const errors = report(`${REPORT.replace('id="B3"', 'id="b3"')}${text}`)
  assert.ok(errors.includes('B3 was raised in v2, but the report has no element with id="B3"'), errors.join('\n'))
  for (const target of ['/courses/new', 'shots/gone.png', '#nowhere']) {
    assert.ok(!errors.some((error) => error.includes(target)), errors.join('\n'))
  }
})

test('the report check reads the report the latest version names', () => {
  const { root } = project()
  assert.deepEqual(runCheck({ root, audit: 'ui', app: 'course', report: true }).errors, [
    "the latest version's report, docs/audit/ui/course/reports/v2/review.html, does not exist",
  ])
  write(root, '.gitignore', 'docs/audit/*/*/reports/\n')
  write(root, 'docs/audit/ui/course/reports/v2/review.html', REPORT)
  write(root, 'docs/audit/ui/course/reports/v2/shots/rail.png', 'png')
  assert.deepEqual(runCheck({ root, audit: 'ui', app: 'course', report: true }).errors, [])
})

test("an app's reports/ is no part of its records, and Git must ignore it", () => {
  const { root } = project()
  write(root, 'docs/audit/ui/course/reports/v2/review.html', REPORT)
  assert.deepEqual(runCheck({ root, audit: 'ui', app: 'course' }).errors, [
    'Git does not ignore docs/audit/ui/course/reports/: add docs/audit/*/*/reports/ to .gitignore',
  ])
  write(root, '.gitignore', 'docs/audit/*/*/reports/\n')
  assert.deepEqual(runCheck({ root, audit: 'ui', app: 'course' }).errors, [])
})

test('without an audit, every app of both audits is checked under its own name, and with one, its apps alone', () => {
  const { root, audited } = project()
  const bank = valid({ audited, later: audited })
  delete bank['config.json']
  writeRecords(root, bank, 'docs/audit/ui/bank')
  writeRecords(root, valid({ audited, later: audited }), 'docs/audit/non-ui/course')
  write(root, 'docs/audit/.DS_Store', 'not a records file')
  write(root, 'docs/audit/ui/.DS_Store', 'not a records file')
  const results = runChecks({ root })
  assert.deepEqual(
    results.map((result) => result.records),
    ['docs/audit/non-ui/course', 'docs/audit/ui/bank', 'docs/audit/ui/course'],
  )
  assert.deepEqual(results[0].errors, [])
  assert.ok(results[1].errors.includes('there is no config.json'), results[1].errors.join('\n'))
  assert.deepEqual(results[2].errors, [])
  assert.equal(results[2].verified, 4)
  assert.deepEqual(
    runChecks({ root, audit: 'ui' }).map((result) => result.records),
    ['docs/audit/ui/bank', 'docs/audit/ui/course'],
  )
})

test("records outside an audit's app folder are refused before any app is read, even when one app is named", () => {
  const refusal = (records, error) => [{ records, errors: [error], summary: [], verified: 0 }]
  const top = (holds) =>
    refusal(
      'docs/audit',
      `docs/audit/ holds ui/ and non-ui/, one folder per audit, and nothing else, but it holds ${holds}: an app's records move, unchanged, into docs/audit/ui/<app>/, or into docs/audit/non-ui/<app>/ when they are a non-UI audit's`,
    )
  const flat = temporaryRoot()
  git(flat, 'init', '-q')
  writeRecords(flat, valid(), 'docs/audit')
  const written = 'config.json, fixes, v1-verdicts.json, v1.json, v2-verdicts.json, v2.json'
  assert.deepEqual(runChecks({ root: flat }), top(written))
  assert.deepEqual(runChecks({ root: flat, audit: 'ui', app: 'course' }), top(written))
  const byApp = temporaryRoot()
  writeRecords(byApp, valid(), 'docs/audit/course')
  assert.deepEqual(runChecks({ root: byApp }), top('course'))
  const byAudit = temporaryRoot()
  writeRecords(byAudit, valid(), 'docs/audit/ui')
  assert.deepEqual(
    runChecks({ root: byAudit, audit: 'ui' }),
    refusal(
      'docs/audit/ui',
      "docs/audit/ui/ holds one folder per app, named for it, and nothing else, but it holds config.json, v1-verdicts.json, v1.json, v2-verdicts.json, v2.json: an app's records move, unchanged, into docs/audit/ui/<app>/",
    ),
  )
  assert.deepEqual(runChecks({ root: temporaryRoot() }), refusal('docs/audit', 'there are no records at docs/audit'))
  assert.deepEqual(runChecks({ root: temporaryRoot(), audit: 'non-ui' }), refusal('docs/audit/non-ui', 'there are no records at docs/audit/non-ui'))
})

test('the command reads the audit, then the app, each optional, and its flags', () => {
  assert.deepEqual(commandPlan([]), { audit: null, app: null, complete: false, report: false })
  assert.deepEqual(commandPlan(['non-ui']), { audit: 'non-ui', app: null, complete: false, report: false })
  assert.deepEqual(commandPlan(['ui', 'course', '--complete', '--report']), { audit: 'ui', app: 'course', complete: true, report: true })
  assert.throws(() => commandPlan(['--strict']), /Unknown option --strict/)
  assert.throws(() => commandPlan(['course']), /course is not an audit: name ui or non-ui first/)
  assert.throws(() => commandPlan(['ui', 'a', 'b']), /Usage/)
  assert.throws(() => commandPlan(['ui', 'docs/audit/ui/course']), /docs\/audit\/ui\/course is not an app: name its folder in docs\/audit\/ui\//)
})

test('the command exits 0 on sound records, 1 on refused ones, and 2 on a usage error', () => {
  const { root } = project()
  const passed = spawnSync(process.execPath, [CLI], { cwd: root, encoding: 'utf8' })
  assert.equal(passed.status, 0, passed.stderr)
  assert.match(passed.stdout, /^Audit records passed: docs\/audit\/ui\/course \(4 proofs verified\)\n4 findings in 2 areas/)
  assert.match(passed.stdout, /\ndone {10}1 {2}A1\n/)
  const refused = spawnSync(process.execPath, [CLI, 'ui', '--complete'], { cwd: root, encoding: 'utf8' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /B2 is still accepted/)
  const missing = spawnSync(process.execPath, [CLI, 'ui', 'none'], { cwd: root, encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /there are no records at docs\/audit\/ui\/none/)
  const misused = spawnSync(process.execPath, [CLI, 'none'], { cwd: root, encoding: 'utf8' })
  assert.equal(misused.status, 2)
  assert.match(misused.stderr, /none is not an audit/)
})
