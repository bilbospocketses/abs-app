# Android TV Support — 10-PR Decomposition Plan

**Maintainer reference for the upstream PR series replacing #1843**

This document is the canonical reference for how the Android TV support work
(originally submitted to `advplyr/audiobookshelf-app` as PR #1843, ~7,000 LOC)
is being split into a series of 10 smaller, focused PRs. All of them are
open now and can be reviewed in any order.

It is hosted on the **fork** (`bilbospocketses/abs-app`) so that upstream PR
descriptions can link to a single durable plan without bloating the upstream
repository.

---

## Why decompose?

PR #1843 surfaced two valid concerns from the maintainer's review experience:

1. **Volume** — a single 7,000-LOC PR is a large ask of any maintainer's review
   time, even for additive work.
2. **Mixed content** — the original PR included ~3,500 LOC of internal
   development docs, plans, specs, and a 12.7 MB PDF, inflating the perceived
   code change.

This plan addresses both:

- **Strip non-code from upstream contributions.** Docs, plans, specs, PDF, and
  screenshots stay on the fork. Each upstream PR contributes a single
  ~25-line `docs/pr-NN-<short-name>.md` linking back to fork-hosted context.
- **Split the upstream code into a 10-PR series in three dependency layers.** Average PR
  size: ~335 LOC. Largest PR: ~1,630 LOC across 17 focused files.
- **Refactor the fork to a modular engine structure first** (shipped in v1.0.10)
  so the fork and upstream PRs share one code structure.

Net result: the maintainer-facing review unit changes from `~7,000 LOC × 1 PR`
to ~10 small PRs averaging ~335 LOC, with the largest single PR being
`~1,630 LOC across 17 small files`.

The architectural choice (TV code in dedicated files like `plugins/tv/` with
inline gating in shared components) is preserved deliberately. Analysis of an
inline alternative showed only ~50-100 LOC savings (<4%) with real downsides
(file fragmentation, harder cross-cutting evolution, more files touched per
PR). The detailed inline-vs-external rationale is in Section 9 of the design
spec.

---

## The 10 PRs at a glance

| # | Title | LOC | Layer | Depends on | Files |
|---|---|---|---|---|---|
| 1 | Foundation + TV detection | ~125 + 1 binary | 1 | nothing | 11 files (manifest, Kotlin, Vuex, layouts) + tv_banner.png |
| 2 | Keyboard hygiene (tabindex + keydown.enter.prevent) | ~300 | 1 | nothing | 25+ shared Vue components, additive only |
| 3 | Side drawer: hide "Go to Web Client" on TV | ~19 | 1 | nothing (gate inert until PR1) | `SideDrawer.vue` — **shares this file with PR2** |
| 4 | CSS foundation (tv-focus.css + variable) | ~132 | 1 | nothing | 3 files |
| 5 | Engine kit — utility modules + page handlers | ~1,630 | 2 | PR 1 | 17 files in `plugins/tv/` (each ≤235 LOC) |
| 6 | Engine integration — listeners + dispatcher | ~615 | 2 | PR 5 (stacked) | 2 files in `plugins/tv/` + `nuxt.config.js` |
| 7 | Audio player TV behavior | ~100 | 3 | PR 1, PR 6 | `AudioPlayer.vue` (KeepAwake, close-vs-minimize, History gate, auto-fullscreen) |
| 8 | Settings + focus-color picker | ~180 | 3 | PR 4, PR 6 | `settings.vue` TV section + `TvFocusColorPicker.vue` |
| 9 | Server connect form D-pad nav | ~150 | 3 | PR 2, PR 6 | `ServerConnectForm.vue` |
| 10 | Author detail page | ~120 | 3 | PR 2 | `pages/author/_id.vue` + 3 related Vue files |

**Average PR size: ~335 LOC. Largest single PR: ~1,630 LOC across 17 files
(each file ≤235 LOC).**

The total upstreamable code (~3,100 LOC) is higher than the original estimate
of ~2,530 because the engine is now counted in its modular form (PR5 + PR6 ≈
2,245 LOC vs. the old 1,675-LOC monolith — the ~28% modularization overhead the
design spec predicted) plus the v1.0.11 fast-scroll fixes that landed in the
engine. Per-PR review size is what matters, and it stays small.

---

## Submission structure — the whole series is open

**All 10 PRs in the series are open simultaneously, plus 2 small companion
PRs.** They were originally planned as three sequential waves, each opening
only after the previous one merged. That pacing was chosen to avoid dropping a
large number of PRs on the maintainer at once. In practice it just meant the
work sat unreviewable, so the whole series is now on the table and can be
reviewed and merged in whatever order suits you.

Nothing about the decomposition itself changed — only when the PRs became
visible. The layering below is a **merge-order dependency graph**, not a gate:

### Layer 1 — foundation (no dependencies)

PRs 1, 2, 3, and 4 are independent of everything, including each other. Any of
them can merge first. Each is small and additive; after they land, phone and
tablet behavior is byte-identical to before — the foundation enables TV but
activates no navigation.

**One file-overlap note:** PR2 (keyboard hygiene) and PR3 (hide "Go to Web
Client" on TV) both touch `components/app/SideDrawer.vue`, in different
regions. Whichever merges second may need a trivial rebase. The same is true of
PR2 and PR7 (`AudioPlayer.vue`) and PR2 and PR8 (`pages/settings.vue`).

### Layer 2 — engine (PR6 is stacked on PR5)

PR5 (engine kit) ships dormant library code: modules that export functions and
attach to nothing at runtime. PR6 activates it by registering the global
keydown listener and wiring the router, store, and event-bus hooks.

**PR6's branch is stacked on PR5's**, so until PR5 merges, PR6's diff shows
PR5's files as well. Merge PR5 first and PR6's diff reduces to its own three
files. The split exists so the function library can be reviewed separately from
the wiring that turns it on.

Both depend on PR1 for the `isAndroidTv` detection state.

### Layer 3 — features (independent of each other)

PRs 7, 8, 9, and 10 each add one TV feature on top of the live engine. They are
independent of each other and can merge in any order once their dependencies
are in. PR7, PR8, and PR9 assume PR6; PR10 does not strictly need it.

PR10 (author detail page) is arguably not TV-specific — the app has no author
detail page on any platform today, so mobile users would get the same feature.
It is flagged in its own PR description for your discretion and can be dropped
without affecting PRs 1-9.

### Companion PRs (outside the numbered series)

Two small, unrelated PRs are open alongside the series:

- **Android back-button handling** — drawer dismiss on all Android, plus exit
  when logged out on Home for TV. Independent of the series.
- **`.gitattributes` LF normalization** — a repo hygiene chore. Heads up that
  merging it triggers a one-time repo-wide line-ending renormalization, so it
  may be worth merging on its own, at a quiet moment, or not at all.

---

## The v1.0.10 fork refactor (preceded upstream submission)

Before any upstream PR opens, the fork shipped v1.0.10 — a single
behavior-preserving commit that split the former 1,675-line
`plugins/tv-navigation.js` monolith into focused modules under `plugins/tv/`,
sharing state through a `tvContext` singleton object. As of v1.0.11 the modular
tree is **19 files** (the refactor plus the fast-scroll column-drift fix, which
added `selectors.js` and extended `spatialNav.js`/`gridNav.js`/`listeners.js`).

**Why first:** so the fork and upstream PRs share one code structure. Without
this, every upstream PR would require translating between the monolithic fork
structure and the modular upstream submission — ongoing dual-maintenance pain.

**Behavior parity was the success criterion** — the refactor moved code without
changing it. ESLint clean, full TV manual checklist pass on Google TV Streamer
4K, plus phone smoke before merge.

**Release notes:** *"Internal refactor: split `tv-navigation.js` into focused
modules under `plugins/tv/`. No user-visible changes. Foundation for future
upstream PR submission."*

---

## What happens to PR #1843

Closed with a comment redirecting to this plan. Draft below — it acknowledges
the gap since the 2026-05-25 "incoming shortly" comment, and corrects that
note's "each PR gated on the next" framing. Recorded here verbatim as the
comment that was actually posted; its "later waves" pacing has since been
dropped in favour of opening the whole series at once (see above):

> Apologies for the gap since my last note here. I used the time to land a few
> stability fixes on the fork first — most notably a long-standing fast-scroll
> focus bug — so the upstream series starts from a solid base rather than
> chasing known issues across PRs.
>
> Closing this in favor of the 10-PR series we discussed, which addresses the
> volume feedback. Two changes from this PR: the internal docs/specs/PDF are
> stripped out (each PR links back to a plan on my fork instead of carrying
> them), and the code is split into small, focused PRs. The first wave —
> foundation + TV detection, keyboard hygiene, a one-item side-drawer gate, and
> the CSS foundation — is **fully independent: each can be reviewed and merged
> on its own, in any order** (my earlier "gated on the next" note was wrong for
> this wave). Later waves build on the foundation. Full breakdown, dependency
> graph, and rationale: [PR_DECOMPOSITION_PLAN.md](link). First PRs opening
> shortly.

---

## Per-PR `docs.md` convention

Each upstream PR adds a single file at `docs/pr-NN-<short-name>.md` (e.g.,
`docs/pr-01-foundation-detection.md`). Each file is ~25 LOC and contains:

- Link back to this plan
- 1-2 paragraphs on the PR's scope
- Links to architecture context on the fork (e.g., `TV_FOCUS_SYSTEM.md`)
- 1 sentence on the testing performed
- Dependency relationships within the series

No PR edits any other PR's docs file. After all 10 PRs merge, upstream `docs/`
contains 10 lightweight context files. The introduction of `docs/` is
deliberate but minimal — maintainer is free to repurpose the directory
later for their own conventions.

---

## Status

| Phase | Activity | Status |
|---|---|---|
| 1 | Publish v1.0.10 fork refactor | done |
| 2 | Close PR #1843 with redirect to this plan | done |
| 3 | Submit PRs 1-4 | done (2026-06-06) |
| 4 | Rebase the series onto current `master` | done (2026-08-25) |
| 5 | Submit PRs 5-10 + the 2 companion PRs | done (2026-08-25) |
| 6 | Maintainer review / merge | in your hands |
| 7 | Post-merge cleanup on the fork | ~1 day |

Every open PR in the series is rebased onto `master` at `12025ab5`
(`Version bump 0.14.0-beta`) and builds green (`npm run generate`, plus
`compileReleaseKotlin` for the one PR with Kotlin changes). If `master` moves
and a PR goes stale, say the word — rebasing the set is quick.

---

## Where to find more detail

- **Full design spec** (file-by-file mapping, dependency graph, alternatives
  considered, risk + contingency planning): [`docs/superpowers/specs/2026-05-18-pr-decomposition-and-fork-modularization-design.md`](superpowers/specs/2026-05-18-pr-decomposition-and-fork-modularization-design.md)
- **TV focus system architecture overview:** [`docs/TV_FOCUS_SYSTEM.md`](TV_FOCUS_SYSTEM.md)
- **End-user TV feature documentation:** [`docs/TV_USER_GUIDE.md`](TV_USER_GUIDE.md)
- **TV user guide PDF (12.7 MB):** [`docs/TV_USER_GUIDE.pdf`](TV_USER_GUIDE.pdf)

---

## Questions or concerns

Open a discussion thread on the fork
([`bilbospocketses/abs-app/discussions`](https://github.com/bilbospocketses/abs-app/discussions))
or comment on any of the open PRs in the series.

The plan is a starting point. Maintainer preference adjustments (e.g., combine
some PRs, split a PR further, reorder the waves) are acceptable and the design
spec's Section 10 outlines contingencies for the most likely variations.

---

**Last updated:** 2026-08-25 — the full series is now open. Previously PRs 1-4
were open and PRs 5-10 were held pending Wave-1 merges; that sequencing has
been dropped and everything is submitted. The whole series was rebased from the
2026-05-13 base onto `master` at `12025ab5`. Two upstream changes interacted
with the series and were folded in: the `POST_NOTIFICATIONS` permission
refactor in `MainActivity.kt` (PR1) and the new podcast sort/filter settings
keys in `store/user.js` (PR4). Plan originally created 2026-05-18; re-validated
to 10 PRs 2026-06-06.
