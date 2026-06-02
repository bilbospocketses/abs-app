/**
 * Spatial D-pad target finders.
 *
 * Beam-model navigation: horizontal stays in row at edges; vertical finds
 * nearest element in the next row.
 *
 * Reads tvContext.lastFocusRect to maintain column when focus is briefly
 * lost during virtualizer card detach/reattach cycles.
 *
 * Extracted from plugins/tv-navigation.js during v1.0.10 refactor.
 */

import { tvContext } from './context.js'
import { centerOf, isSameRow, getAllFocusable } from './visibility.js'
import { findPageScrollContainer } from './scrollHelpers.js'

export function findHorizontalTarget(direction) {
  const current = document.activeElement
  if (!current) return null

  const currentRect = current.getBoundingClientRect()
  const goingRight = direction === 'ArrowRight'

  // Exclude player controls from page navigation (player has its own handler)
  const playerContainer = document.getElementById('streamContainer')
  const currentInPlayer = playerContainer?.contains(current)

  // Snapshot every candidate's rect ONCE. getBoundingClientRect forces a
  // synchronous layout; calling it inside the filter + sort comparator below
  // (once per candidate, O(n log n) in the sort) thrashes layout on every
  // keypress. Reading from the Map instead collapses that to one reflow per
  // focusable. The Map is ephemeral per call — no invalidation needed (I4).
  const focusables = getAllFocusable()
  const rectMap = new Map()
  for (const el of focusables) rectMap.set(el, el.getBoundingClientRect())

  const candidates = focusables.filter((el) => {
    if (el === current) return false
    // Don't navigate between player and page content via horizontal nav
    if (!currentInPlayer && playerContainer?.contains(el)) return false
    if (currentInPlayer && !playerContainer?.contains(el)) return false
    const rect = rectMap.get(el)
    if (!isSameRow(currentRect, rect)) return false
    return goingRight ? rect.left > currentRect.left : rect.right < currentRect.right
  })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const aRect = rectMap.get(a)
    const bRect = rectMap.get(b)
    const aDist = goingRight ? aRect.left - currentRect.left : currentRect.right - aRect.right
    const bDist = goingRight ? bRect.left - currentRect.left : currentRect.right - bRect.right
    return aDist - bDist
  })

  return candidates[0]
}

export function findVerticalTarget(direction) {
  const current = document.activeElement
  if (!current) return null

  // When the virtualizer detaches the focused card during rapid scrolling,
  // focus falls to body. Use the last known card position to maintain column.
  const focusLost = !current || current === document.body
  const currentRect = focusLost && tvContext.lastFocusRect ? tvContext.lastFocusRect : current.getBoundingClientRect()
  const currentCenter = centerOf(currentRect)
  const goingDown = direction === 'ArrowDown'

  // If focus is lost and we have no saved position, we can't navigate
  if (focusLost && !tvContext.lastFocusRect) return null

  // Find the scrollable container the current element lives in
  const scrollContainer = findPageScrollContainer(focusLost ? null : current)
  const isInScrollable = !focusLost && scrollContainer?.contains(current)

  // Exclude player controls from page navigation (player has its own handler)
  const playerContainer = document.getElementById('streamContainer')
  const currentInPlayer = !focusLost && playerContainer?.contains(current)

  // Snapshot every candidate's rect ONCE — see findHorizontalTarget (I4).
  const focusables = getAllFocusable()
  const rectMap = new Map()
  for (const el of focusables) rectMap.set(el, el.getBoundingClientRect())

  const candidates = focusables.filter((el) => {
    if (el === current) return false
    // Don't navigate between player and page content via generic vertical nav.
    // The player entry/exit is handled explicitly in handleKeyDown.
    if (!currentInPlayer && playerContainer?.contains(el)) return false
    if (currentInPlayer && !playerContainer?.contains(el)) return false
    const rect = rectMap.get(el)
    if (isSameRow(currentRect, rect)) return false
    const center = centerOf(rect)
    const isCorrectDirection = goingDown ? center.y > currentCenter.y : center.y < currentCenter.y
    if (!isCorrectDirection) return false

    // When navigating up from inside a scrollable area, only allow jumping
    // to elements outside it (e.g. nav bar) if scrolled to the very top
    if (isInScrollable && !goingDown && !scrollContainer.contains(el)) {
      if (scrollContainer.scrollTop > 50) return false
    }

    return true
  })

  if (candidates.length === 0) return null

  // Find the nearest row, then closest element horizontally
  candidates.sort((a, b) => {
    const aDy = Math.abs(centerOf(rectMap.get(a)).y - currentCenter.y)
    const bDy = Math.abs(centerOf(rectMap.get(b)).y - currentCenter.y)
    return aDy - bDy
  })

  const nearestRect = rectMap.get(candidates[0])
  const nearestRow = candidates.filter((el) => isSameRow(nearestRect, rectMap.get(el)))

  nearestRow.sort((a, b) => {
    const aDx = Math.abs(centerOf(rectMap.get(a)).x - currentCenter.x)
    const bDx = Math.abs(centerOf(rectMap.get(b)).x - currentCenter.x)
    return aDx - bDx
  })

  return nearestRow[0]
}
