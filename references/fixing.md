# Applying fixes

## Steps

- A step is one row of the project's plan, or one item of the session's task list when the project has
  none. It names the finding IDs it closes, records them in its fix file,
  `docs/audit/<audit>/<app>/fixes/<STEP>.json`, one in the folder of each app whose findings it closes and
  one in `docs/audit/<audit>/shared/` for the shared findings it closes, and is complete when their proofs
  pass and the project's own gates pass.
- Order: the design authority first, so every later step builds what the document says; then shared
  foundations, such as tokens, the frame, and the module that words the backend's refusals, with the
  accepted shared findings; then the screens and modules that use them, where an app's finding cut down to
  its own part follows the shared finding that took the rest; then the tests that would have caught the
  findings, where the steps did not already add them.
- Size: small enough that one focused check can fail on it. A step that touches every screen is two steps.
- Slice by screen or file, not by pattern. A screen is done when all its findings are, so a step that fixes
  one pattern across twenty screens leaves twenty screens half done.

## Rethink, never copy

The proposal was drawn from a capture; the fix meets the real code. Before building it, measure what its
callers and real data need. Where the build departs from the proposal, record in the finding's `departs`, in
the step's fix file, what was decided, why, the strongest case against, and what would change it. A
departure is not a failure; an unrecorded one is.

## Proof

Each finding closes with its proofs, in its entry in the step's fix file. [records.md](records.md) gives each
kind's fields and what the checker confirms of it.

| Kind | Example | Fits |
| --- | --- | --- |
| Test | `tests/e2e/course.spec.ts` "the rail of a 42-class course fits in one window" | behaviour, layout, states, words |
| Text | `tools/ui/check-visual-system.mjs` holding its rule against a colour pair under 4.5:1, with `scripts/lint.mjs` holding the command that runs it; `.oxlintrc.json` holding the rule that refuses importing the engine outside `src/lib/engine` | rules across the code, through the check or lint rule that enforces them: contrast, tokens, sizes, architecture and boundaries |
| Search | "that is not a version of a course" in `src`, which finds five lines at the audited commit and none now | facts about the files themselves: a name, a token, a copied pattern; never behaviour |
| JSON | `package.json`, where `/devDependencies/typescript` resolves and `/dependencies/typescript` does not | package metadata and configuration |
| Eye | `docs/audit/ui/course/reports/v2/proof/C8.png`, compared with the proposal's mockup | taste in the UI audit, where nothing can be measured |

A proof must be able to fail on the defect. Write the test before the fix and watch it fail, or measure the
defect the test guards and put that measurement in the proof's `note`: "measured the rail at 906 px in its
835 px pane before the fold". A test that would pass on the broken code proves nothing, and its finding stays
`accepted`. A search records what it finds at the audited commit and what it finds now, and a text or JSON
proof must not hold at the audited commit; every run of the checker confirms both.

The defects a proof must fail on are the ones the finding's title names. A detail only its body or its
proposal gives does not hold it open; if that detail breaks later, a later version raises it as a finding of
its own. So a title names each defect the finding is about, and nothing it is not.

An eye proof is the last resort. It says what was compared with what, and it is never used where a
measurement exists. Only the UI audit uses one.

## Closing a finding

1. The proof passes on the fixed code, and the project's gates for the step pass.
2. Write the finding's entry in the step's fix file: its proofs, any departure, and the earlier steps that
   worked on it. Nobody writes its status; the entry makes it `done`.
3. Run the checker.

## Closing the round

When every accepted finding is done, run the checker with `--complete`. The round is closed. The next
`audit` runs every proof again and records whether each holds or regressed.
