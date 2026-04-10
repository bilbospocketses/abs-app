# TV Focus System — Technical Reference

This document describes the D-pad focus management system for Android TV, implemented in `plugins/tv-navigation.js`. It is intended for developers working on the TV navigation PR or extending TV support.

---

## Architecture Overview

The focus system has three layers:

1. **Spatial Navigation** — `findVerticalTarget()` / `findHorizontalTarget()` pick the nearest focusable element in the pressed direction using bounding rect geometry.
2. **Fingerprint Restore** — `restoreFromFingerprint()` saves and restores focus position across router navigations (Back button).
3. **Overlay Focus Trapping** — `handleOverlayNavigation()` traps D-pad navigation inside modals and drawers, with a focus history stack for open/close restore.

All TV behavior is gated behind the `android-tv` CSS class on `<html>` (injected by `MainActivity.kt`) or the `isAndroidTv` Vuex state.

---

## Fingerprint Restore — Navigation Matrix

When the user navigates between pages, the system saves a "fingerprint" of the focused element (ID, structural path, scroll position, bounding rect) and restores it on Back navigation.

### Lookup Methods

| Method | Used For | How It Works |
|---|---|---|
| **ID selector** | Book, series, collection, playlist cards | `document.querySelector('#book-card-5')` — fast and reliable. Visibility check filters out virtualizer orphan nodes. |
| **Author index** | Author cards | nth `.author-card-wrapper` element — author cards don't have unique IDs. |
| **Structural path** | Buttons without IDs (ellipsis, play, etc.) | Walks up the DOM building tag+index pairs from the element to a parent with an ID. Fragile if DOM structure changes. |
| **Position fallback** | Last resort | Finds the nearest focusable element by bounding rect distance to the saved position. |

### Page Navigation Fingerprint Behavior

| Source Page | Action | Destination | Back Restores To | Lookup Method | Scroll Restore | Virtualizer |
|---|---|---|---|---|---|---|
| Home | Click book card | Book detail | Book card | ID (`#book-card-N`) | Yes | No (shelves) |
| Home | Click series card | Series detail | Series card | ID (`#series-card-N`) | Yes | No |
| Home | Click author card | Author detail | Author card | Author index | Yes | No |
| Library | Click book card | Book detail | Book card | ID (`#book-card-N`) | Yes | Yes |
| Series grid | Click series card | Series detail | Series card | ID (`#series-card-N`) | Yes | Yes |
| Collections grid | Click collection | Collection detail | Collection card | ID (`#collection-card-N`) | Yes | Yes |
| Playlists grid | Click playlist | Playlist detail | Playlist card | ID (`#playlist-card-N`) | Yes | Yes |
| Authors grid | Click author | Author detail | Author card | Author index | Yes | No |
| Author detail | Click book card | Book detail | Author book card | ID (`#author-book-N`) | Yes | No |
| Playlist detail | Ellipsis → History | History page | Ellipsis button | Structural path | Yes | No |
| Item detail | Ellipsis → History | History page | Ellipsis button | Structural path | Yes | No |
| Episode detail | Ellipsis → History | History page | Ellipsis button | Structural path | Yes | No |
| Podcast page | Click episode title | Episode detail | Episode row element | Structural path / ID | Yes | No |

### Scroll Restore Timing

Scroll position is restored **synchronously before each element lookup attempt** via `ensureScroll()`. This ensures the target element is in the viewport when `isVisible()` checks it. Previous approach (parallel timers for scroll and lookup) caused a regression where off-screen elements were rejected before scroll completed.

```
ensureScroll() → element lookup → isVisible() check → focus or retry
```

The function retries up to 12 times (250ms fast-poll, then 500ms slow-poll) to handle slow-loading content and virtualizer re-renders.

### Virtualizer Considerations

Grid pages (Library, Series, Collections, Playlists) use a virtualizer that only renders cards near the current scroll position. On fingerprint restore:

1. `ensureScroll()` sets scroll position to where the card was
2. The virtualizer begins rendering cards at that position
3. First lookup attempt may fail (card not rendered yet)
4. Retry at 250ms succeeds after virtualizer renders

During rapid vertical scrolling, the virtualizer may detach the currently focused card:
- `lastFocusRect` tracks the last known card position
- `findVerticalTarget()` uses `lastFocusRect` when `document.activeElement === body` (focus lost)
- This maintains the correct column during fast scroll even when the focused card is temporarily removed from the DOM

---

## Overlay Focus Management

### Focus History Stack

When a modal or drawer opens, the currently focused element is pushed to `focusHistory[]`. On close, the element is popped and re-focused. Supports nested overlays.

| Trigger | Overlay Type | Open Behavior | Close Behavior |
|---|---|---|---|
| Book/episode ellipsis (⋮) | More menu modal | Save focus, focus first modal option | Pop focus history, restore to ellipsis |
| Library selector | Library list modal | Save focus, focus first library item | Pop focus history, restore to selector |
| Hamburger menu (☰) | Side drawer (Vuex) | Save focus, focus first drawer item | Pop focus history, restore to hamburger |
| Sleep timer / Chapters | Modal | Save focus, focus first option | Pop focus history, restore to player button |
| More Info (from ellipsis) | Modal → Modal transition | Debounced — keeps original focus saved | Pop returns to original ellipsis, not intermediate modal |

### Modal Transitions

When one modal closes and another opens in quick succession (e.g., ellipsis → More Info), a debounce timer prevents the focus history from being corrupted. The original pre-modal element is preserved.

---

## Main → Main Navigation

When switching between top-level sections via the nav bar (e.g., Library → Authors):

1. Delete fingerprints for both source and destination pages
2. Set `pendingScrollToTop = true`
3. Clear `lastBookshelfScrollData` in Vuex (prevents LazyBookshelf from restoring old scroll position)
4. In `afterEach`: scroll to top (twice, at 200ms and 800ms, to beat LazyBookshelf's restore race)
5. `refocusAfterContentChange()` polls for the first card and focuses it

---

## Server/User Screen Focus (TV-only)

The server connection screen (`pages/connect.vue` + `components/connection/ServerConnectForm.vue`) has TV-specific focus management:

| Transition | Focus Target | Mechanism |
|---|---|---|
| Open server list (initial) | First server entry row | `$nextTick` → querySelector for first `.border-b` row |
| Add New Server | Server address `<input>` | `$nextTick` → `$refs.serverAddressInput.focus()` |
| Submit server address | Username `<input>` | `$nextTick` → `$refs.usernameInput.focus()` |
| Edit server address (pencil) | Server address `<input>` | `$nextTick` → `$refs.serverAddressInput.focus()` |
| Back to server list | First server entry row | `$nextTick` → querySelector |
| Delete server entry | Entry above deleted (or top) | `$nextTick` → querySelector by index |

### TV Layout Adjustments

- Server list box uses column flow layout (`flex-col`) instead of vertical centering — prevents the box from overlapping the logo when entries grow
- Logo section is in-flow (not absolute positioned) on TV
- Outer container has `overflow-y-auto` for scrolling when entries exceed viewport
- Username label (`config.username`) displayed above each server entry in bold white text

---

## Logged-Out State Handling

When the user is logged out and lands on a page with no content (e.g., navigating away from the server connect screen via Back), the focus system has no cards, buttons, or content elements to focus. This triggers a special recovery flow:

1. `focusFirstContentElement()` exhausts all lookup options (cards, play button, content area fallback)
2. Detects logged-out state via `_store.state.user.user === null`
3. Clears all stale focus state (`pageFocusMemory`, `focusHistory`, `lastFocusRect`)
4. Shows a toast notification: "No user is logged in. Returning to Home to connect." (5 seconds)
5. Navigates to Home (`/`) using `router.replace` (not `push`) to avoid growing the history stack
6. Home page renders with the maintainer's Connect button, which receives focus

### Back Button Exit (Android TV only)

The Capacitor `backButton` handler in `init.client.js` has a special case: if on Android TV, logged out, and on the Home page, pressing Back shows the exit confirmation dialog regardless of remaining history entries. Without this, stale history entries from the pre-logout session would prevent the user from exiting — Back would cycle through old pages that all redirect back to Home.

```
backButton handler:
  if (isTV && isLoggedOut && isHome) → show exit dialog
  else if (!canGoBack) → show exit dialog
  else → window.history.back()
```

---

## isVisible() Function

`isVisible(el)` is used throughout the focus system to filter focusable elements. It checks:

1. `display !== 'none'`, `visibility !== 'hidden'`, `opacity !== '0'`
2. Bounding rect width and height > 0
3. Element is within the viewport bounds (not off-screen)

The viewport check (step 3) is critical for preventing the side drawer's Disconnect button (translated off-screen via CSS transform) from being included in D-pad navigation targets. This check must NOT be weakened — instead, fix timing issues that cause legitimate elements to be temporarily off-screen (see Scroll Restore Timing above).

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| All TV code gated behind `android-tv` class | Zero impact on phone/tablet builds |
| Spatial "beam model" navigation | Horizontal stays in row, vertical finds nearest row — feels natural on grid layouts |
| Focus memory uses fingerprints, not element references | Elements are destroyed and recreated on page navigation; fingerprints survive re-renders |
| `lastFocusRect` for rapid scroll recovery | Virtualizer detaches cards during scroll — saved position maintains column alignment |
| `ensureScroll` before lookup (not parallel) | Prevents timing race where elements are rejected as off-screen before scroll applies |
| Strict `isVisible` with viewport check | Prevents translated/off-screen drawer elements from stealing focus |
| `verticalNavInProgress` guard | Prevents `focusout` recovery from fighting virtualizer card re-attachment during scroll |
| Player isolated from page navigation | Player controls have their own D-pad handler; `findVerticalTarget` excludes player elements |
