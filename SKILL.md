---
name: app-slop-audit
description: Audit a built web app's UI for what was rushed or generated without judgment, or, when asked, what no screen shows, such as its backend, data, and code; keep every finding, verdict, and fix in committed records so repeated audits build on each other instead of changing their mind; and apply accepted fixes in tracked steps that each close with proof. Use when asked to find UI slop or rushed work in an app's screens, to run a non-UI audit of an app's backend, data, or code, to record verdicts on audit findings, to apply or verify audit fixes, or to import an earlier audit report into the records.
---

# App Slop Audit

An audit of an app someone built quickly, often with AI: what is rushed, ported rather than designed, or
never looked at at the size real use reaches; why each should be redone; and the new version. It can run as
often as wanted. The records make the runs one history: each run starts from what earlier runs found and
what the maintainer decided, checks that again, and only then looks for something new.

## Two audits

The skill is for the UI. It runs one of two audits, and the request says which:

- **The UI audit**, the default: what a user sees and does, every screen and every state of it, and the
  frontend code that draws them. Its reference is [ui.md](references/ui.md).
- **The non-UI audit**, only when the request asks for it: what no screen shows, such as the backend, the
  rules, the data, the structure of the code, and the tests. Its reference is
  [non-ui.md](references/non-ui.md).

A problem a user can see on a screen belongs to the UI audit, wherever its cause lies; one no screen shows
belongs to the non-UI audit. Each audit has its own records, `docs/audit/ui/<app>/` and
`docs/audit/non-ui/<app>/`, with its own standards, areas, findings, verdicts, and fixes. Every run, in any
mode, works on one audit: it reads, re-checks, decides, and fixes only that audit's findings, and leaves
what belongs to the other to a run of it. A request that names neither is for the UI audit, unless it
continues work on the non-UI audit's records, such as verdicts on its latest version.

Read [records.md](references/records.md) before any mode. Read the audit's reference and
[report.md](references/report.md) before `audit`, [report.md](references/report.md) before `import`, and
[fixing.md](references/fixing.md) before `apply`.

The checker in `assets/checker/` is the only implementation of the records' rules. Run it from this skill's
folder against the project; never copy it into a project:

```
node <this skill>/assets/checker/check-records.mjs [ui|non-ui] [app] [--complete] [--report]
```

With an audit and an app, it checks those records, `docs/audit/<audit>/<app>/` under the current directory,
which is the project's root in a Git repository; with an audit alone, every app's records in it; with
neither, every app's in both. Every run verifies each proof of a done or accepted finding against the
files: it counts each search again, today and at the audited commit, and confirms each test is still
declared under its title. `--report` also checks the latest version's report;
`--complete` also refuses any finding still open, accepted, regressed, or triggered, and any proposal still
waiting for its answer. On a pass it prints what each version raised and re-checked, then where each
finding stands. Its own tests: `node --test <this skill>/assets/checker/records.test.mjs`.

## Modes

Infer the mode from the request. With none: `import` when an audit report exists and no records do,
otherwise `audit`.

- `audit` — run the next version: re-check every earlier finding, look for new ones, write the report,
  record both in the version's file, and stop for the maintainer's verdicts.
- `decide` — record the maintainer's verdicts and the principles they settle.
- `apply` — fix accepted findings in steps, each closing named findings with proof.
- `import` — turn an audit made before this skill into the records' v1.

Never combine `audit` with `decide` or `apply` in one pass. An audit ends at the maintainer's decision.

## One app or several

Each audited app has its own folder in each audit's records, `docs/audit/<audit>/<app>/`, named for the
app. It holds the app's records and, in `reports/`, which git ignores, each version's report. A single run
and a fan-out write the same files.

- A **single run** audits one app. This session does every step.
- A **fan-out** audits several apps at once, in one audit, one agent per app, started by this session, the
  coordinator. Only `audit` fans out. `decide` stays in one session because the maintainer answers one
  question at a time, and `apply` because it changes code the apps may share. Either may write in several
  apps' folders when one decision or one fix covers them.

Before starting any agent, the coordinator:

1. Confirms that no one outside the run is working in the project, and records the fan-out where the
   project tracks work: the audit, the apps, the commit, and each app's folder.
2. Adds `docs/audit/*/*/reports/` to `.gitignore` when it is missing.
3. Has the maintainer confirm the severity definitions of each app without records in this audit, when the
   project gives none, one question at a time, so no agent has to ask.
4. Builds each app at that commit, one after another, and serves each, with everything it calls, on ports
   of its own that the project does not use for development, with its own copy of the data, as the audit's
   reference describes. It writes down each server's process ID.
5. Starts one agent per app, telling it the audit, its app, folder, code, address, and commit; its confirmed
   severity definitions; the code it shares with other apps; and its siblings and their folders.

Each agent runs `audit` for its app, with four differences:

- It writes only in its app's folder. It builds nothing, starts or stops no server, changes neither the
  plan nor `.gitignore`, and commits nothing.
- It captures from the address it was given, in the UI audit with a browser of its own.
- Changes in a sibling's folder are the sibling's; changes to the plan and `.gitignore` are the
  coordinator's. Any other change it did not make means someone outside the run is working in the
  project: it stops and tells the coordinator, which stops every agent and server and says so.
- It never asks the maintainer anything. At step 9 of `audit`, or wherever a single run would stop to ask,
  it returns that to the coordinator, which asks and, once answered, finishes that app's audit itself.

When every app's audit is done, the coordinator stops the servers it started, by their process IDs,
closes the fan-out's entry where it recorded it, and runs the checker with `--report`. It gives the
maintainer each app's report and summary, then the decisions one question at a time, naming each finding
with its app, since every app counts its own IDs, and asking once about findings that several apps raised
on the same shared code. Asked to commit, it commits its own changes first, then each app's records
separately.

## What keeps a run from changing its mind

A run that judges the app afresh each time flips on taste, raises again what was rejected, and drops what
it raised before. These rules exist to stop that; they are the point of the skill.

1. **The records come first, read whole.** The config's standards (the design authority and what each
   severity means), areas, and out-of-scope list, every principle, every cleared item, and every finding
   bind the run.
2. **A finding keeps its ID for good.** Before raising anything, search the records for the same place and
   the same problem. A match is the old ID, re-checked, never a new one. IDs are never reused or renumbered.
3. **Decisions are reversed in the open, never silently.** A run that disagrees with a principle, a
   rejection, an exclusion, or a cleared item writes a reopen proposal giving evidence that did not exist
   when it was decided: the code changed, a new measurement, a user's report. Taste is not new evidence.
   Without such evidence the decision stands and the run raises nothing.
4. **Every earlier finding is accounted for.** Each finding still open, accepted, done, regressed,
   deferred, or triggered gets a re-check in the new version saying what was observed. The checker refuses
   a version that skips one.
5. **The bar is written down once.** Severity is judged by the config's own definitions and the design by
   its design authority. Changing either is a maintainer decision, made in the config, not a run's choice.

## Safety

- Read the project's instructions first (`AGENTS.md`, `CLAUDE.md`, the README, its plan). Where they
  conflict with this skill, they win; say so.
- `audit` changes no tracked file except its own file in the records, the `.gitignore` line for the reports
  once per project, and a fan-out's entry where the project tracks work. It captures from a production
  build of the commit it records, serves copies of real data, and points every paid or external call at an
  address that refuses it. It never runs a paid operation.
- If anyone outside the run is working in the project, another session or a person, write nothing there.
  Say so and stop. A fan-out's coordinator and agents are one run.
- Commit nothing unless asked. The records are committed with the work that changes them; reports and
  screenshots stay in the app's `reports/`, which git ignores.
- Never delete an earlier version's report, and never edit or delete an earlier records file. A finding
  that no longer applies is re-checked as `obsolete`, with its reason.

## Mode: audit

1. Read the project's instructions, the records, the design authority, and the plan, and run the checker
   for the audit and the app. With no records this run is v1: write `config.json` as
   [records.md](references/records.md) describes, its standards and areas first, and have the maintainer
   confirm the severity definitions when the project gives none; in a fan-out, use the ones the coordinator
   had confirmed.
2. Record the commit (`git rev-parse --short HEAD`), the date, and the state of the working tree. Name the
   new version and its scope: everything the audit covers, or the part the maintainer named.
3. Capture the app as the audit's reference describes, at the size real use reaches, into
   `docs/audit/<audit>/<app>/reports/vN/`. Add `docs/audit/*/*/reports/` to `.gitignore` when it is
   missing.
4. Re-check every earlier finding that is not rejected or obsolete, before looking for anything new: the
   checker has run the proofs of every done finding, and look again at each finding's `where`. Write one
   re-check per finding, with the outcomes [records.md](references/records.md) lists and what was observed.
   A done finding that broke again is `regressed`. A deferred finding whose trigger has fired is
   `triggered`, and goes to the maintainer for a decision.
5. Look for new findings with the audit's reference, through everything it covers. For each candidate:
   search the records; check it against the principles, rejections, out-of-scope list, and cleared items;
   measure it; give it a kind and a severity by the config's standards; and design its new version from
   what the screen or module is for, measured against real data, not from its current shape. A candidate
   that belongs to the other audit is not raised; step 9 names it.
6. Review the draft as its harshest reader. Drop each candidate whose evidence does not hold, whose cost to
   the user cannot be stated, or which restates a choice the design made on purpose. Record each dropped
   candidate among the version's cleared items with why it is sound, so the next run does not raise it.
7. Write `docs/audit/<audit>/<app>/reports/vN/review.html` as [report.md](references/report.md) describes.
8. Write the version's file, `docs/audit/<audit>/<app>/vN.json`: its date, commit, scope, and report; each
   re-check; each reopen proposal; each new finding; and the cleared items. Run the checker for the audit
   and the app with `--report` and fix everything it names.
9. Stop. Give the report's path, what came back, what is still open, the new findings by severity, and
   what was seen that belongs to the other audit. Then the decisions needed: each new design finding and
   each reopen proposal framed as what it changes, why, the case against, and a recommendation, ending on
   one question.

## Mode: decide

Write the round as a new file of the latest version, `vN-verdicts.json` for its first round and
`vN-verdicts-2.json` and on after it, with the date and who decided. Never edit an earlier round.

1. For each finding the maintainer ruled on, a decision, with any departure from the proposal agreed then:
   - `accepted`, with `doneWhen`: the observable check that will say it is fixed.
   - `rejected`, with its `reason`.
   - `deferred`, with its `trigger`: what would bring it back.
   A decision that changes an earlier round's verdict says why in `reverses`.
2. Turn each accepted design finding, and each accepted defect that states a rule the app must keep, into a
   principle. Change the project's design authority to say the same before any code changes, or make that
   change the first step of `apply`.
3. For a reopen proposal, an answer: `reopened`, with the new decision or the changed principle in the same
   round, or `kept`, with why, so no later run proposes it again on the same evidence.
4. Run the checker.

## Mode: apply

Follow [fixing.md](references/fixing.md).

1. Group the accepted findings into steps: design-authority changes first, then shared foundations, then
   the screens and modules that use them, then the tests that would have caught them. Each step is small
   enough to verify alone and names the finding IDs it closes.
2. Put the steps where the project tracks work: rows of its execution plan when it has one, the session's
   task list otherwise. Never in the records, which hold no order of work.
3. Rethink each new version rather than copying the proposal: measure what its callers and real data need.
   Record every departure from the proposal in the finding's entry in the step's fix file.
4. Close each finding in the step's fix file, `docs/audit/<audit>/<app>/fixes/<STEP>.json`, with its
   proofs: a test that fails without the fix, a search or a file's text for a fact about the files
   themselves, or, for a pure matter of taste in the UI audit, a look by eye recorded with its screenshot. A
   finding whose proofs cannot fail on each defect its title names stays `accepted`, its entry saying what
   is left.
5. Run the checker after every step, and with `--complete` when the round is done. Every run of the checker
   verifies every proof again.

## Mode: import

For an audit report made before this skill. Its findings go to the audit each belongs to, by the rule under
Two audits: a report holding findings of both becomes v1 of each audit, each with its own findings and both
naming the same report.

1. Read the old report whole. Each finding becomes one of its audit's v1 raised findings under its original
   ID, with its kind, severity, where, problem, and proposal, and its area in that audit's config.
2. Fill each `v1.json`'s date, commit, and report from the report: the date it was captured and the commit
   it was captured from, or, when the report names none, the last commit before its capture, saying so in its
   scope. Leave the report where it is and name its path; do not move or rewrite it.
3. Take each verdict from where the project recorded it: the plan, a decision record, the maintainer's
   words, and write them as `v1-verdicts.json`, naming that source. A finding no decision covers stays
   `open`.
4. Give each fixed finding its proofs, in the fix file of the step that fixed it, by finding the test,
   check, or search in the code and confirming that it exists and fails on each defect the finding's title
   names. Never write a proof from a summary. A fixed finding without one stays `accepted`, with the gap
   said in its entry's `left`.
5. Write the principles the adopted design choices settled in `v1-verdicts.json`, the exclusions the design
   states in the config, and the report's own list of what it checked and cleared in `v1.json`, each in the
   audit it belongs to.
6. Run the checker for each audit it imported into, with `--report`.

## Stop conditions

Stop and ask one framed question when:

- the project gives no severity definitions and the maintainer has not confirmed the ones proposed;
- a finding's verdict cannot be found and the maintainer has not given one;
- two sources of design authority disagree;
- a fix would contradict a principle, a rejection, or the design authority; or
- someone outside the run is working in the project.
