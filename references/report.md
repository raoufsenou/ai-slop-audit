# The report

Each version writes one disposable HTML page, `docs/audit/<audit>/<app>/reports/vN/review.html`, with what
its capture made beside it: its scripts, its facts file, and, in the UI audit, its screenshots; git ignores
`reports/`. The maintainer reads it once and decides from it; the records keep what it found. Never overwrite
an earlier version's folder.

Both audits lay out their reports the same way. How to capture, and what a card's current state and new
version are, is in the audit's own reference: [ui.md](ui.md) or [non-ui.md](non-ui.md).

## Layout

1. Title and lede: which audit, UI or non-UI, what it covered, at which commit, from what data, and how paid
   calls were refused.
2. The numbers: findings by severity and by kind; from v2 on, also how many came back, are still open, hold,
   became obsolete, and are proposed for reopening.
3. The pattern behind most of it: the few causes, each naming the findings it explains.
4. How to read the tags: the config's severity definitions and the three kinds, word for word.
5. Contents, by area, each entry linking to its finding.
6. From v2 on, before the new findings:
   - Came back: each regressed finding as a full card, with its failing proof.
   - Still open: one line per open or accepted finding, with what was observed.
   - Reopen proposals: the decision, the new evidence, and the recommendation.
7. The new findings, by area, one card each.
8. From v2 on, re-checked and holding: one line per finding, with what was observed.
9. Appendices: checked and not slop (this version's cleared items), left out on purpose (the config's
   out-of-scope list), how it was captured, and where it sits in the project's plan.

## A finding's card

```html
<section class="finding" id="A2">
  <header>A2 · severity tag · kind tag</header>
  <h3>Pages scroll as one document</h3>
  <div class="why">The problem and its measurements; for a design finding, the design's sentence it
    questions, quoted; and why it should be redone, in the user's terms.</div>
  <div class="cmp">
    <figure>Current: screenshots of the real app, or the code</figure>
    <figure>New version: drawn, or the code</figure>
  </div>
  <p class="note">What the new version changes, and what will prove it fixed.</p>
</section>
```

- The element's `id` is the finding's ID; `--report` checks that every new finding has one.
- Current is always the real thing, and a sentence is never the new version; the audit's reference says
  what each is.
- One finding per problem. Two problems in one place are two cards; one problem in ten places is one.
- Severity and kind come from the config's standards, never from how bad the current state looks.

## Before handing it over

- Open the page and look at every card: images load, mockups render, and nothing overflows.
- Run the checker with `--report`: every new finding has its card, every re-checked finding is named, and
  every image and anchor resolves.

## Importing an earlier report

An earlier report becomes v1 as it is, of the audit its findings belong to, or of each audit when it holds
findings of both: its path goes in each `v1.json`'s `report`, and the file stays where it is.
Take its date from the report, and the commit it was captured from from its capture appendix or from the
project's plan. When neither says, use the last commit before the capture (`git log --before`) and say so in
its scope. Findings keep the report's IDs and areas, and the report's tag for each finding gives its kind:
a build defect is `defect`, a design choice `design`, and not built `missing`.
