# Fire TV Focus Debug Build

This document describes the diagnostic instrumentation added on the `fire-tv-focus-handling` branch. **This build is intended to gather information from a reporter with a Fire TV Stick 4K (2nd gen) / Fire OS 8. It must not be merged into `master` as-is.**

---

## Why this branch exists

A user reported that on Fire TV Stick 4K (2nd gen, Fire OS 8.1.6.6 / Android 11), the Audiobookshelf app's TV build v1.0.7 cannot navigate into the Home / Library / Authors tab content after the connect phase unless the user holds the D-pad down button during connection.

Working hypothesis: Fire TV uses Amazon's customized WebView (`com.amazon.webview.chromium`), which has stricter "first user interaction required" focus semantics than the stock Android TV Chrome WebView. Amazon's own documentation notes that the first D-pad press may be consumed by the WebView selecting itself before inner focus can land on an element.

The fix direction depends on what the logs show:

- **Option 1 — post-connect focus pulse**: if our existing `checkAndInit` poll finds a card and calls `.focus()` but the WebView still shows `activeElement=body` at the next keydown, the fix is to refine the pulse to satisfy Fire TV's interaction gate.
- **Option 2 — synthetic interaction**: if the logs show the poll completing but focus never sticking, we may need to dispatch a synthetic event at startup. Higher risk due to `isTrusted:false` and broader blast radius.

---

## Diagnostic instrumentation

All changes are in `plugins/tv-navigation.js` and are gated behind the existing `android-tv` class check in `checkAndInit`.

### Startup banner

On `checkAndInit`, the following lines are written to `AbsLogger` (viewable via Settings → Logs):

```
[tv-debug] ========== fire-tv-focus-debug build initialized ==========
[tv-debug] userAgent: <navigator.userAgent>
[tv-debug] initial path: <window.location.pathname>
[tv-debug] initial activeElement: <tag#id.class or 'body'>
[tv-debug] user logged in at init: <boolean>
```

The `userAgent` line identifies the Fire TV model (e.g. `AFTKA` = Fire TV Stick 4K 2nd gen).

### Focus poll instrumentation

The existing `pollForCards` setInterval (500ms, max 30 attempts) now logs:

```
[tv-poll] attempt=<N> returned=<bool> before=<el> after=<el>
```

Logged on attempts 1-3, every 5th attempt thereafter, and any successful attempt. When the poll ends:

```
[tv-debug] focus poll ending: attempts=<N> result=<bool> finalActiveElement=<el>
```

### Capture-phase keydown logger

A document-level keydown listener registered in capture phase (runs before `handleKeyDown`) logs every D-pad arrow + Enter keypress:

```
[tv-keydown] <key> repeat=<bool> activeElement=<el> path=<route>
```

Throttled to 50ms between log entries to avoid flooding during held-down repeat events while still catching the auto-repeat cadence (~100ms on most platforms).

---

## How to read the logs

The reporter shares a log file exported via Settings → Logs → Share. Key signals to look for:

| Pattern | Interpretation |
|---|---|
| `[tv-poll] attempt=N returned=true … after=DIV#book-card-0…` followed by `[tv-keydown] ArrowDown … activeElement=body` | Focus was placed but the WebView rejected/overrode it before the keypress. Indicates Option 2 may be needed. |
| `[tv-poll] attempt=30 returned=false finalActiveElement=body` | The poll exhausted without finding content. Content never rendered, or the selectors in `focusFirstContentElement` don't match whatever the first page renders. |
| `[tv-keydown] ArrowDown repeat=true activeElement=DIV#book-card-5…` appearing many times with increasing card IDs | The held-down workaround works because auto-repeat keeps delivering events as content loads. Confirms the interaction-gate hypothesis. |
| `[tv-debug] user logged in at init: false` on cold start | Connect hadn't completed yet when TV nav initialized; the poll is racing the server fetch. |

---

## What to do before merging

If any of these changes survive into master, the following **must** be reverted or gated:

1. The capture-phase keydown logger produces a log line for every D-pad press. Users would see thousands of entries in the log viewer. Either remove or wrap in `if (process.env.NODE_ENV !== 'production')`.
2. The `[tv-debug]` banner and `[tv-poll]` instrumentation should be removed or gated similarly.
3. The APK filename override (`android/app/build.gradle` outputFileName) should revert to `abs-android-tv-release.apk`.

The actual fix, once identified from the reporter's logs, should be a small, production-quality change in `focusFirstContentElement` or `checkAndInit` — not the instrumentation itself.

---

## Build artifact

- Branch: `fire-tv-focus-handling`
- APK: `abs-android-tv-release-firetv-focus-debug.apk`
- Build: release (not debug) — memory note [Release builds for ABS] requires `assembleRelease` on TV to avoid 3× slower startup
- Release tag on fork: `android-tv-v1.0.7-firetv-debug` (pre-release)
