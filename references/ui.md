# The UI audit

What a user sees and does: every screen and every state of each screen, and the frontend code that draws
them. A problem a user can see on a screen belongs here, wherever its cause lies; what no screen shows
belongs to the [non-UI audit](non-ui.md).

## Capture

- Build the app the way it ships, a production build of the commit the version's file records, and serve it
  on a port the project does not use for development.
- Serve copies of real data at real size, never the originals. Point every paid or external service at an
  address that refuses connections, such as `http://127.0.0.1:9`, so no click can spend money or send
  anything.
- Capture with a script in the version's report folder, driving a browser through each screen and state at
  1440 × 900 and 390 × 844: full-page and element screenshots, and the measurements each finding cites
  (heights, contrast ratios, counts, durations) written to a facts file the report quotes.
- Prefer the project's own committed measuring tools where they exist. A measurement that will become a
  proof belongs in the project, not in the report's folder.
- Write every command in the report's capture appendix, so the next version can repeat the capture.

## What to look for

Rushed and AI-built apps fail in recognisable ways. Go through every screen and every state of each screen
with this list. It is a floor, not a ceiling: anything on a screen that costs a user time, trust, or work is
a finding, whether it is listed here or not.

### First, the size real use reaches

Most rushed defects show only at real size, because the build was checked with three items. Seed or copy
data as large as the real thing, with every item, the longest names, and the full history, and audit at that
size. Record it in the config's standards as `realSize` so every version audits at the same size.

- Measure, do not characterise: page and pane heights (`document.documentElement.scrollHeight` and each
  scrolling element's `scrollHeight`), counts of repeated elements, widths that overflow. "19,057 px, 21
  windows at 900 px" is a finding; "long" is not.

### Frame and navigation

- Does the window scroll, or only the content? Do the navigation and the primary actions stay in reach?
- Does the navigation fit at real size, mark where the user is, and say what comes next?
- Can every thing a page names be followed to its own page? Are related views linked both ways?
- What does a wrong address show: the app's own page inside its frame, or the framework's?
- Does every page have its own title? Is there a layout for a narrow screen?

### Words

- The internals' vocabulary on screen: command names, help text, exit codes, file paths, hashes, IDs, enum
  values in capitals, the backend's own sentences.
- Refusals and errors shown word for word from the backend, with no way forward.
- Costs in internal units (model calls, tokens, requests) where the user thinks in minutes or money.
- The same fact said twice on one screen, or one thing named three ways across screens.
- Labels that name a design document, another product, or the framework.
- Instructions to run a command in a terminal, shown in a browser app.

### States

A rushed build renders a state rather than designing it. For every screen, find and capture each one.

- Empty: does it hold the action that fills it?
- Loading: does it show the page's shape, or nothing for seconds?
- Error and not found: in the app's frame and words, with a way out; never a stack trace.
- Disabled: says why, next to the control, once.
- Long-running: progress, the expected time, and what comes next; never minutes of silence.
- Concurrent: are other actions live while one runs, and what happens when two start?
- Finished: a brief confirmation. Failed: stays, dated, with a way to try again and to dismiss it.
- Stale: does a result linger for days after it stopped mattering?
- Refused: does the form keep what was typed?
- Interrupted: what do a reload, the back button, or a closed tab do to a running or paid operation?
- Partial or outdated: is it marked, and does it say what to do?

### Page structure

- One primary action per state, with the rest grouped; not five buttons around one object.
- Content first; telemetry, receipts, and metadata after it.
- An order that follows the user's task, and the design's order where it gives one.
- Lists at real size as a table, a grid, or a bar rather than tall cards; thumbnails with a viewer.
- Tabs with one tab, disclosures around one line, wrappers around one element.
- Pieces the design specifies that the build never made.

### Visual system

- Tokens defined but unused, used but undefined, and hard-coded colours beside them.
- Contrast, measured: 4.5:1 for text and 3:1 for large text and controls (WCAG AA), in every theme,
  placeholders and disabled text included.
- Counts of type sizes, radii, shadows, button variants, and focus styles; more than the design names is
  drift.
- Decoration used as structure: monospace capitals everywhere, a border around everything.
- Raw browser controls, such as a file input, in a designed app.
- Fonts the design names that the served app never loads.
- Controls that show the state they are not in, such as a theme toggle showing the other theme.

### Accessibility

- One landmark per region, each named; dialogs named; a live region for progress.
- Toggles expose their state; a tab bar implements the whole pattern or is a row of links.
- Every path works by keyboard; focus moves into a dialog and back out of it.

### The code that draws them

- Components doing several jobs: count their lines and responsibilities.
- A component, a formatter, or a style rewritten in every screen instead of shared.
- Work redone on every render.
- Error boundaries that show internals.
- Dead code: a component gallery nothing renders, unused tokens and classes.

### Tests

- What do they assert: words only, or also layout, overflow, contrast, and the states above?
- Do they select by styling classes or headings, so a restyle breaks them and a defect does not?
- Are they seeded at toy size?
- For each finding, which test would fail on it? When none could, the finding says what its proof will be.

## The pattern behind them

After the findings, name the few causes behind most of them, each with the findings it explains. They are
usually some of these: the backend's or the CLI's output ported into HTML instead of designed; a build made
and checked at toy size; states rendered, not designed; the design's own pieces skipped; and nothing that
could fail on any of it.

## Not findings

- What the config's out-of-scope list or the design leaves out on purpose.
- Taste with no cost to a user that can be stated.
- What a principle or a rejection settled, unless there is new evidence; then it is a reopen proposal.
- What an earlier version cleared, unless what it concerned has changed.

## A finding's card

- Current is a screenshot from the capture, cropped to the part in question and labelled with its
  measurement, or the frontend code quoted with its path and lines.
- Draw the new version as HTML and CSS in the page whenever it is a question of design (layout, words,
  states, the visual system), using the app's own tokens and type copied into the report's stylesheet, so
  old and new compare at the same scale. Give code as code. A sentence is never the new version of a
  screen.
