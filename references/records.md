# The audit records

One folder per audited app in each audit's records, committed: `docs/audit/ui/<app>/` for the UI audit and
`docs/audit/non-ui/<app>/` for the non-UI audit. Both audits keep their records the same way, and neither
reads the other's. An app's folder is the memory of that audit of the app: what each version found and
re-checked, what the maintainer decided, and what each fix step closed and with what proof.
Each audit, each round of verdicts, and each fix step is a file of its own, written once and never edited
afterwards, so the folder's files are its history; the one exception is a correction of the latest version
before its first round of verdicts, described below. No file states a finding's status: the checker works it
out from them. The records hold no order of work. Steps live in the project's plan, and the records never
compete with it.

The checker enforces everything below except what the last section lists, which is the auditor's job and
which the next version checks again.

## Layout

```
docs/audit/
  ui/                        the UI audit's records
    <app>/                   one folder per audited app, named for it
      config.json            the standards, the areas, and what the design leaves out
      v1.json                audit v1: its commit, its report, and what it raised and cleared
      v1-verdicts.json       the maintainer's first round of verdicts on v1, and the principles they settle
      v1-verdicts-2.json     a second round on v1, when there is one
      v2.json                audit v2: what it re-checked, proposed to reopen, raised, and cleared
      fixes/
        APP-AUDIT-SHELL.json one fix step, named for the plan row or task that made it
      reports/               each version's report, which git ignores, as report.md describes
  non-ui/                    the non-UI audit's records, laid out the same way
```

No other file belongs in an app's folder, nothing but `ui/` and `non-ui/` belongs in `docs/audit/`, and
nothing but apps' folders belongs in either; hidden files, such as `.DS_Store`, are ignored. The checker
skips `reports/`, apart from what `--report` checks there, and refuses it unless git ignores it. Versions
count from v1 without gaps, and records without v1 are refused. Each version's rounds of verdicts count the
same way: `vN-verdicts.json` first, then `vN-verdicts-2.json`.

Every file is a JSON object. Every text field is a non-empty string, and a key the format does not name is
refused, so a misspelt field fails instead of vanishing. A list a file has nothing for may be left out. Every
path is relative to the project's root and stays inside it.

## config.json

The bar every version judges by, written once and changed only by the maintainer's decision.

```json
{
  "format": "app-slop-audit records 1",
  "standards": {
    "designAuthority": "`docs/DESIGN.md`, The App",
    "high": "misleads the user, loses or hides work, or makes a core task slow at real size",
    "medium": "friction or clutter met on every visit",
    "low": "polish and code hygiene",
    "realSize": "a course of 42 classes, three a week for a 16-week term"
  },
  "areas": [
    { "letter": "A", "name": "Layout and navigation", "covers": "the frame every page shares, how pages link, and how tall they grow" },
    { "letter": "B", "name": "Words", "covers": "what the app says, and whose vocabulary it says it in" }
  ],
  "outOfScope": [
    { "what": "Editing a value in place; every change is a request for changes.", "source": "`docs/DESIGN.md`, Left Out" }
  ]
}
```

- `standards` names the design authority, which for the UI audit is the design and for the non-UI audit the
  document that says how the system is built, such as its architecture, and defines each severity by the
  app's own users and their core tasks. Other standards may follow, such as `realSize`, the data an audit
  seeds or copies, so every version audits at the same size.
- `areas` gives each area of the app one or two capital letters other than `P`, which principles use, set by
  v1; every finding's ID starts with a declared letter. A later version adds a letter only for an area the app did not have, and never renames or
  reuses one. Areas may follow the app's structure (screens, layers) or the kinds of problem (words, states,
  visual system). Choose what makes a finding's place obvious, then keep it.
- `outOfScope` lists what the design leaves out on purpose, each with where that was decided, so no version
  raises it.

## vN.json: an audit

```json
{
  "date": "2026-11-02",
  "commit": "1999623",
  "scope": "Every screen and state, on a copy of the real course",
  "report": "docs/audit/ui/course/reports/v2/review.html",
  "rechecked": [
    { "finding": "A2", "outcome": "holds", "observed": "the frame spec passes at 1999623" },
    { "finding": "B1", "outcome": "waiting", "observed": "the rail has not been redesigned" }
  ],
  "reopens": [
    { "target": "P3", "evidence": "teachers on the pilot read the amber chip as an error", "recommendation": "reopen, and give stale its own colour" }
  ],
  "raised": [
    {
      "id": "B7",
      "title": "The run panel is a terminal",
      "kind": "defect",
      "severity": "high",
      "where": "`src/components/run-panel.tsx`, every run",
      "problem": "a failed call reads \"Failed with exit code 1\" over the AI library's error dump",
      "proposal": "each known outcome as a sentence and an action, with the raw log under Technical details"
    }
  ],
  "withdrawn": [{ "id": "B8", "why": "merged into B7: the run panel's exit codes are the same problem" }],
  "cleared": ["The engine's journal: one parser reads every line, and the app never writes it."]
}
```

| Key | Holds |
| --- | --- |
| `date`, `commit` | When it ran, and the commit it audited, not the one that recorded it; the commit must be in the repository. Dates never go back. |
| `scope` | What it covered: everything its audit covers, or the part the maintainer named. |
| `report` | Its report, relative to the project's root; `--report` checks the latest version's. |
| `note` | Optional: what a later reader needs to know about how this version was made, such as an import, or a correction and what it changed. |
| `rechecked` | From v2 on, one entry for every finding still open, accepted, done, regressed, deferred, or triggered before it, saying what was observed. |
| `reopens` | Its proposals to reverse a decision, each with the evidence that did not exist when it was decided and a recommendation. |
| `raised` | Its new findings. |
| `cleared` | What it looked at and judged sound, including the candidates it dropped on review, so no later version raises them again without new evidence. |
| `withdrawn` | Only from a correction: each finding it raised and withdrew before any verdict, with its `id` and `why`. |

A raised finding:

| Key | Holds |
| --- | --- |
| `id` | Its area's letter and the next number, such as `B7`: above every number an earlier version raised or withdrew in that area. It belongs to this finding for good and is never reused or renumbered. |
| `title` | Each defect it is about, and nothing it is not: its proofs must fail on each. |
| `kind` | `defect`: the build is wrong or contradicts its own design. `design`: the design asked for this, so changing it is a decision. `missing`: neither designed nor built, but expected of any app. |
| `severity` | `high`, `medium`, or `low`, by the config's standards. |
| `where` | The files, screens, or states, precisely enough to look again. |
| `problem` | What is wrong, with its measurement and how it was taken. A design finding quotes the design's sentence it questions. |
| `proposal` | The new version, in words; the report draws it. |

A re-check's outcome depends on where the finding stood:

| The finding was | Outcome | Then it is |
| --- | --- | --- |
| open, accepted, or regressed | `open`: still not fixed | as it was |
| done | `holds`: its proofs still pass | done |
| done | `regressed`: broken again | regressed |
| deferred or triggered | `waiting`: its trigger has not fired | deferred |
| deferred or triggered | `triggered`: it has, and the maintainer decides again | triggered |
| any of these | `obsolete`: what it concerned is gone, with the reason in `observed` | obsolete |

A proposal's `target` is a finding's ID, a principle's ID, `out of scope: ` followed by an item's `what` word
for word, or `cleared in vN: ` followed by an earlier version's cleared item word for word.

## Correcting the latest version

Until the first round of verdicts on it, the latest version's file may be corrected; that is the `report`
mode's work. Once a round exists, the file never changes again, and a later version corrects it in the open,
by re-checking and raising.

- A finding whose evidence does not hold, or that another already covers, is withdrawn: it leaves `raised`
  and joins `withdrawn`, with `why`. One that proved sound is also among the cleared items, so no later run
  raises it again; one merged into another names it in `why`. A withdrawn finding is no finding: nothing
  re-checks, decides, or fixes it.
- A finding that holds two problems keeps its ID for one; the other takes the next number in its area.
- A finding the capture shows and the version missed takes the next number in its area.
- No ID is reused or renumbered, and a withdrawn ID stays taken.
- `date` and `commit` stay the capture's; `note` says when the version was corrected and what changed.

## vN-verdicts.json: a round of verdicts

```json
{
  "date": "2026-11-03",
  "by": "the maintainer",
  "source": "`SELECT-NEXT-AFTER-AUDIT-V2` in `PLAN.md`",
  "decisions": [
    { "finding": "B7", "verdict": "accepted", "doneWhen": "every run outcome reads as a sentence with what to do" },
    { "finding": "B8", "verdict": "rejected", "reason": "the output is what the teacher asked to see" },
    { "finding": "C3", "verdict": "deferred", "trigger": "when the rail is redesigned" }
  ],
  "reopens": [
    { "target": "P3", "answer": "kept", "why": "the pilot's teachers were reading a build without the chips' words" }
  ],
  "principles": [
    { "id": "P16", "rule": "A run's outcome is a sentence with what to do.", "from": ["B7"] }
  ]
}
```

| Key | Holds |
| --- | --- |
| `date`, `by` | When the maintainer decided, and who. Never before the version's date or an earlier round's. |
| `source`, `note` | Optional: where the decision was recorded, and what else a reader needs to know. |
| `decisions` | One for each finding ruled on: `accepted`, with `doneWhen`, the observable check that will say it is fixed; `rejected`, with its `reason`; or `deferred`, with its `trigger`, what would bring it back. An optional `note` records a departure from the proposal agreed then. |
| `reopens` | One answer for each of this version's proposals: `reopened` or `kept`, with `why`. |
| `principles` | The rules later versions judge new work against. |

A decision may rule on any finding that this version or an earlier one raised and that is not obsolete.
Ruling again on one an earlier round decided, unless its trigger has fired, changes that verdict, so the
decision says why in `reverses`. A proposal answered `kept` leaves its decision as it was, so no decision in
that round changes it, and no later run proposes it again on the same evidence. One answered `reopened` takes
effect in the same round: a finding gets its new decision, a principle is changed or retired, and an
out-of-scope item leaves the config. A round answers its version's proposals before the next audit.

A principle states the rule, not its history: what must stay true, and the findings it comes from, each
accepted, done, or regressed. A new principle takes the next number, above every earlier one. A later round
changes one by giving its ID again with the new `rule` and `from` and `changed`, why it changed, or retires it
with `retired` alone, why it no longer holds. An ID is never reused.

## fixes/STEP.json: a fix step

```json
{
  "version": 1,
  "date": "2026-10-08",
  "findings": [
    {
      "id": "A2",
      "departs": "the wait line sits at the top of the step's scrolling content rather than fixed above it",
      "earlierSteps": ["APP-AUDIT-DESIGN"],
      "proofs": [
        { "kind": "test", "file": "tests/e2e/course.spec.ts", "title": "the window never scrolls: the step scrolls beside the rail, under its header" }
      ]
    },
    {
      "id": "C2",
      "proofs": [
        { "kind": "test", "file": "tests/e2e/decisions.spec.ts", "title": "a candidate the engine will not accept says why in a callout that leads to the fix, beside a disabled Accept" }
      ],
      "left": "Nothing proves the layout no longer breaks: no spec measures where Discard sits."
    }
  ]
}
```

| Key | Holds |
| --- | --- |
| `version` | The audit whose verdicts it acts on. It comes after that version's rounds and before the next audit, and is dated between them. |
| `date` | When the step finished. |
| `findings` | One entry for each finding it closed or worked on, each accepted or regressed when it began. |

An entry:

| Key | Holds |
| --- | --- |
| `id` | The finding. |
| `proofs` | What proves the fix, each of a kind below. An entry that closes its finding has at least one. |
| `left` | What no proof covers yet, which keeps the finding accepted until a later step closes it. An entry without `left` closes its finding, which is then done. |
| `departs` | Optional: where the build departs from the proposal, what was decided, and why. |
| `earlierSteps` | Optional: earlier steps that also worked on the finding without an entry of their own. |

A finding is closed once after each audit: no other step after the same audit closes it again.

## Proofs

Every proof may carry a `note`: what it asserts, or the measurement that shows it fails without the fix, such
as "measured the rail at 906 px in its 835 px pane before the fold". Every run of the checker verifies each
proof of a done finding, and each proof an accepted one has so far.

| Kind | Fields | The checker confirms | Fits |
| --- | --- | --- | --- |
| `test` | `file`, `title` | the file declares a test with that exact title: `test(` or `it(` with the title as its first argument | behaviour, layout, states, words |
| `search` | `patterns`, `paths`, `before`, `now`; optionally `fixed`, `word`, `glob` | the lines matching any pattern, counted across the files under `paths`, number `now` today and `before` at the audited commit | facts about the files themselves: a name, a token, a copied pattern; never behaviour |
| `text` | `file`, `holds` | the file holds each string today, and did not hold them all at the audited commit | the check, lint rule, or configuration that enforces a rule, and the command that runs it |
| `json` | `file`, `present`, `absent` | each JSON pointer in `present` resolves in the file today and none in `absent` does, which was not so at the audited commit; a pointer resolves only to a value that is not empty: not null, `""`, `[]`, or `{}` | package metadata and configuration |
| `eye` | `compared`, `screenshot` | nothing: it records what was compared with what, and where the screenshot is; the non-UI audit's records refuse it | taste in the UI audit, where nothing can be measured |

- The audited commit is the commit of the version the step follows.
- A search's patterns are JavaScript regular expressions, or literal text with `fixed: true`. `word: true`
  matches them only as whole words, and `glob`, such as `*.tsx`, narrows the files by name, or by path when
  it holds a `/`. Today the search reads the files Git tracks or would add under `paths`; at the audited
  commit, the files that commit holds there. Binary files are skipped. `before` and `now` differ, so a
  search that cannot fail is refused.
- A test proof shows the test exists, not that it passes: the project's own gates run it.
- An eye proof is the last resort, never used where a measurement exists, and only the UI audit's records
  hold one.

## How status is worked out

The checker reads the files in order: for each version, its audit, then its rounds of verdicts, then its fix
steps by date, and those of one day by name. A finding's status is where that leaves it.

| Status | Comes from | Later versions |
| --- | --- | --- |
| `open` | raised, with no verdict yet | re-check it |
| `accepted` | an `accepted` decision, or a step that left part of it | re-check it |
| `done` | a step that closed it, with its proofs | re-check that its proofs hold |
| `regressed` | a re-check that found a done finding broken again | re-check it; a later step closes it again |
| `deferred` | a `deferred` decision, or a re-check whose trigger is still `waiting` | re-check whether its trigger has fired |
| `triggered` | a re-check that found its trigger fired | the maintainer decides again |
| `rejected` | a `rejected` decision | leave it; it binds them |
| `obsolete` | a re-check that found what it concerned gone | leave it |

A decision starts a finding's life again: only an entry after its latest decision, and after the latest
re-check that found it regressed, counts toward closing it.

`--complete` also refuses every finding that is open, accepted, regressed, or triggered, and every proposal
of the latest version still waiting for its answer.

## What the checker cannot see

It checks that a proof exists and could fail, not that it fails on each defect the finding's title names;
that a test is declared, not that it passes; that a re-check is recorded, not that it was done; and that an
ID is new, not that its problem is not already in the records under another; that the config changed only
by the maintainer's decision; and that a version's file was corrected only before its first round of
verdicts. Those are the auditor's to get right, and the next version re-checks them.
