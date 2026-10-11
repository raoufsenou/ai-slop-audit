# App Slop Audit

A skill for Codex that audits a built web app for what was rushed or generated without judgment, keeps every
finding, verdict, and fix in records committed to the project, and applies the fixes you accept in steps that
each close with proof. Each audit starts from what the last one found and what you decided, so repeated audits
build on each other instead of changing their mind.

The skill holds the whole procedure, so you never explain it to the agent. Each prompt below names the step
and the apps; the agent reads the rest from the skill.

## Install it, and update it

From this checkout:

```
node scripts/install.mjs            # the first time
node scripts/install.mjs --replace  # after any change to this checkout
```

It copies the skill into `~/.codex/skills/app-slop-audit`, or under `$CODEX_HOME/skills` when that is set: the
folder Codex reads skills from, which Cursor reads too. Agents use that copy, not this checkout, so a change
here does nothing until you reinstall. Without `--replace`, an install that differs is listed file by file and
left as it is.

## The loop

Open the agent in the project's repository and give it one prompt per step. Begin each with
`Use $app-slop-audit`, which names the skill so the agent loads it. The agent commits nothing until you ask, so
say "commit the changes" at the end of each step.

1. **Audit.** The agent serves a production build of the app with a copy of its data, captures every screen
   and state, checks every earlier finding again, looks for new ones, writes a report, and stops with the
   decisions it needs. An app's first audit also asks you what high, medium, and low mean, unless the project
   already says.

   ```
   Use $app-slop-audit to audit the UI of <app>.
   ```

   Several apps at once, one agent per app:

   ```
   Use $app-slop-audit to audit the UI of <app>, <app>, and <app>, one agent per app.
   ```

2. **Read the report.** Open `docs/audit/ui/<app>/reports/vN/review.html` in a browser. Each finding is a
   card: how it looks now, why it should be redone, and the new version.

3. **Reconcile**, when the apps share code. Each app's audit judged the shared code from its own screens, so
   one change to it arrives once per app, worded differently. Reconciling makes each such change one shared
   finding, in `docs/audit/ui/shared/` with a report of its own, and cuts each app's findings down to what is
   its own. An audit of several apps at once ends with this by itself; run it when the apps were audited one
   at a time.

   ```
   Use $app-slop-audit to reconcile the UI audit's apps.
   ```

4. **Decide.** The agent records your verdict on each finding: `accepted`, with the check that will say it is
   fixed; `rejected`, with why; or `deferred`, with what would bring it back. It asks one question at a time,
   the shared findings first. Every later audit keeps to your verdicts, and changing one later needs a reason.

   ```
   Use $app-slop-audit to record my verdicts on the latest UI audit of <app>.
   ```

   Name several apps, or every app, in one prompt. You can rule on many findings at once, such as "accept
   every defect and missing finding as proposed, and ask me about each design finding."

5. **Apply.** The agent puts the accepted findings into small steps in the project's plan, design changes and
   shared code first, and closes each finding with proof, such as a test that fails without the fix.

   ```
   Use $app-slop-audit to apply the accepted findings of the UI audit.
   ```

6. **Audit again**, whenever you like, with the prompt of step 1. It writes the next version, which first
   checks every earlier finding again, the fixed ones included, and only then looks for new ones.

## Picking up an audit an older version of the skill wrote

Check it from the project's root, first as it is and then with its reports:

```
node ~/.codex/skills/app-slop-audit/assets/checker/check-records.mjs ui
node ~/.codex/skills/app-slop-audit/assets/checker/check-records.mjs ui --report
```

When the records pass but their reports do not, and no verdict is recorded yet, rewrite the reports before
deciding anything:

```
Use $app-slop-audit in report mode on every app in docs/audit/ui/, one agent per app.
```

It rewrites each app's latest report from what its audit's capture saved, corrects the records where that
capture proves them wrong, and, over several apps, ends by reconciling them. It starts no server, and copies
each app's stylesheet from the capture or from the production build the audit used, so keep that build until
it has run. Then go on from step 4 of the loop.

## Other prompts

| To | Prompt |
| --- | --- |
| Audit the backend, data, and code instead of the screens | `Use $app-slop-audit to run the non-UI audit of <app>.` |
| Rewrite one app's report before any verdict on it | `Use $app-slop-audit in report mode on <app>.` |
| Bring in an audit report made before this skill | `Use $app-slop-audit to import the audit report at <path>.` |

The non-UI audit keeps its own records, in `docs/audit/non-ui/`, and runs the same loop. Name it in each
prompt, such as "record my verdicts on the latest non-UI audit of <app>".

## Where things are

```
docs/audit/ui/<app>/          one app's records, committed
  config.json                 what high, medium, and low mean, the design it is judged by, and its areas
  v1.json, v2.json, …         each audit: what it checked again, raised, and cleared
  v1-verdicts.json, …         your verdicts on that version
  fixes/<STEP>.json           what each fix step closed, and its proofs
  reports/v1/review.html, …   each audit's report and what it captured, which git ignores
docs/audit/ui/shared/         the code the apps share, once reconciled, kept the same way
docs/audit/non-ui/            the non-UI audit, laid out the same way
```

`reports/` is never committed, so it lives only on the machine that made it. Keep it: the checker's
`--report` refuses an app whose earlier report is gone.

## See where an audit stands

From the project's root:

```
node ~/.codex/skills/app-slop-audit/assets/checker/check-records.mjs ui
```

It prints each app's versions and where each finding stands: open, accepted, done, rejected, and so on. Name
an app, or `shared`, after `ui` to check only those records; add `--report` to check the latest reports too,
and `--complete` to refuse anything still waiting for a decision or a fix. Use `non-ui` for the other audit.

## Rules worth knowing

- An audit, a report, or a reconcile stops at your decisions. Verdicts and fixes are prompts of their own.
- A report or a reconcile changes a version only before its first verdict. After that, the next audit
  corrects it, in the open.
- The project's own instructions, such as its `AGENTS.md`, win where they disagree with the skill.
- If another session or person is working in the project, the agent writes nothing there and stops.

## Changing the skill

`SKILL.md` is the procedure; `references/` holds what each mode reads; `assets/checker/` enforces the records;
`assets/report/` is the report template. Run both test suites, then reinstall:

```
node --test assets/checker/records.test.mjs
node --test scripts/install.test.mjs
node scripts/install.mjs --replace
```
