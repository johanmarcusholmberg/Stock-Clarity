# Icon Audit Report -- StockClarify

**Date:** 2026-04-16
**Scope:** All interactive elements with icons across web (`artifacts/mockup-sandbox/`) and mobile (`artifacts/mobile/`)
**Icon libraries:** lucide-react (web), @expo/vector-icons Feather (mobile)

---

## ERRORS (must fix)

### E01 -- Missing `accessibilityLabel` on icon-only buttons (mobile)

Nearly every icon-only `TouchableOpacity` / `Pressable` on mobile lacks an `accessibilityLabel`. Screen readers will announce nothing meaningful. Only `ErrorFallback.tsx` provides proper labels.

| # | File | Line | Icon | Element | Fix |
|---|------|------|------|---------|-----|
| 1 | `app/(tabs)/index.tsx` | 379 | `bell` | `TouchableOpacity` (alerts) | Add `accessibilityLabel="View alerts"` |
| 2 | `app/(tabs)/index.tsx` | 490 | `trash-2` | `TouchableOpacity` (delete) | Add `accessibilityLabel="Delete portfolio"` |
| 3 | `app/(tabs)/index.tsx` | 548 | `search` | `TouchableOpacity` (search CTA) | Add `accessibilityLabel="Search stocks"` |
| 4 | `app/(tabs)/index.tsx` | 639 | `plus` | `TouchableOpacity` (new portfolio) | Add `accessibilityLabel="Create portfolio"` |
| 5 | `app/(tabs)/index.tsx` | 712 | `trash-2` | `TouchableOpacity` (picker delete) | Add `accessibilityLabel="Remove portfolio"` |
| 6 | `app/(tabs)/index.tsx` | 88 | `folder-minus` | `TouchableOpacity` (delete folder) | Add `accessibilityLabel="Remove folder only"` |
| 7 | `app/(tabs)/index.tsx` | 103 | `trash-2` | `TouchableOpacity` (delete all) | Add `accessibilityLabel="Delete folder and stocks"` |
| 8 | `app/(tabs)/account.tsx` | 464 | `check` | `TouchableOpacity` (save name) | Add `accessibilityLabel="Save name"` |
| 9 | `app/(tabs)/account.tsx` | 467 | `x` | `TouchableOpacity` (cancel) | Add `accessibilityLabel="Cancel editing"` |
| 10 | `app/(tabs)/account.tsx` | 477 | `edit-2` | `TouchableOpacity` (edit) | Add `accessibilityLabel="Edit name"` |
| 11 | `app/(tabs)/account.tsx` | 791 | `star` | `TouchableOpacity` (rate) | Add `accessibilityLabel="Rate app"` |
| 12 | `app/(tabs)/alerts.tsx` | 64 | `check-circle` | `TouchableOpacity` (mark all) | Add `accessibilityLabel="Mark all as read"` |
| 13 | `app/(tabs)/digest.tsx` | 414 | `filter` | `TouchableOpacity` (filter) | Add `accessibilityLabel="Open filters"` |
| 14 | `app/stock/[ticker].tsx` | 857 | `arrow-left` | `TouchableOpacity` (back) | Add `accessibilityLabel="Go back"` |
| 15 | `app/stock/[ticker].tsx` | 869 | `bookmark` | `TouchableOpacity` (watchlist) | Add `accessibilityLabel="Add to watchlist"` |
| 16 | `app/stock/[ticker].tsx` | 1040 | `refresh-cw` | `TouchableOpacity` (refresh) | Add `accessibilityLabel="Refresh data"` |
| 17 | `app/stock/[ticker].tsx` | 583 | `external-link` | `TouchableOpacity` (read more) | Add `accessibilityLabel="Open article"` |
| 18 | `components/SearchBar.tsx` | 30 | `x` | `TouchableOpacity` (clear) | Add `accessibilityLabel="Clear search"` |
| 19 | `components/StockCard.tsx` | 114 | `x` | `TouchableOpacity` (remove) | Add `accessibilityLabel="Remove stock"` |
| 20 | `components/PaywallSheet.tsx` | 159 | `x` | `TouchableOpacity` (close) | Add `accessibilityLabel="Close"` |
| 21 | `components/FolderAddSheet.tsx` | 275 | `x` | `TouchableOpacity` (clear) | Add `accessibilityLabel="Clear search"` |
| 22 | `components/FolderTabStrip.tsx` | 263 | `plus` | `TouchableOpacity` (add) | Add `accessibilityLabel="Add folder"` |
| 23 | `components/FolderTabStrip.tsx` | 370 | `more-horizontal` | `TouchableOpacity` (menu) | Add `accessibilityLabel="Folder options"` |
| 24 | `components/FolderTabStrip.tsx` | 386 | `edit-2` | `TouchableOpacity` (rename) | Add `accessibilityLabel="Rename folder"` |
| 25 | `components/FolderTabStrip.tsx` | 399 | `trash-2` | `TouchableOpacity` (delete) | Add `accessibilityLabel="Delete folder"` |
| 26 | `components/DigestCard.tsx` | 110 | `external-link` | `TouchableOpacity` (source) | Add `accessibilityLabel="Open source"` |

**Total:** 26 icon-only interactive elements missing accessibility labels on mobile.

---

### E02 -- Touch target below 44x44pt (iOS HIG violation, mobile)

Apple requires a minimum 44x44pt touch target. These elements fall short even with `hitSlop`.

| # | File | Line | Icon | Actual size | Effective w/ hitSlop | Fix |
|---|------|------|------|-------------|---------------------|-----|
| 1 | `app/(tabs)/account.tsx` | 464 | `check` (save) | ~26x26 (padding:4 + 18px icon) | 26x26 (no hitSlop) | Add `hitSlop={{top:10,bottom:10,left:10,right:10}}` or increase padding to 13 |
| 2 | `app/(tabs)/account.tsx` | 467 | `x` (cancel) | ~26x26 | 26x26 | Same as above |
| 3 | `app/(tabs)/account.tsx` | 477 | `edit-2` | ~23x23 (padding:4 + 15px icon) | 23x23 | Same as above |
| 4 | `app/(tabs)/account.tsx` | 791 | `star` (rate) | ~32x32 (padding:4 + 24px icon) | 32x32 | Add `hitSlop={{top:8,bottom:8,left:8,right:8}}` |
| 5 | `components/SearchBar.tsx` | 30 | `x` (clear) | ~15x15 (icon only) | ~35x35 (hitSlop:10) | Increase hitSlop to 15 all sides, or wrap in 44x44 container |
| 6 | `components/StockCard.tsx` | 114 | `x` (remove) | 24x24 explicit | ~40x40 (hitSlop:8) | Increase to `width:28, height:28` + `hitSlop:8` = 44, or increase hitSlop to 10 |
| 7 | `components/FolderTabStrip.tsx` | 370 | `more-horizontal` | ~26x26 (padding:4) | ~42x42 (hitSlop:8) | Increase padding to 5 or hitSlop to 9 |
| 8 | `app/(tabs)/index.tsx` | 712 | `trash-2` (picker) | ~24x24 (padding:4) | ~40x40 (hitSlop:8) | Increase to padding:6 + hitSlop:8 = 44 |
| 9 | `app/(tabs)/index.tsx` | 379 | `bell` | 38x38 explicit | 38x38 (no hitSlop) | Increase to `width:44, height:44` or add hitSlop |
| 10 | `app/stock/[ticker].tsx` | 857 | `arrow-left` (back) | 38x38 explicit | ~54x54 (hitSlop:8) | PASS (effective > 44) |
| 11 | `components/PaywallSheet.tsx` | 159 | `x` (close) | ~36x36 (padding:8 + 20px) | 36x36 (no hitSlop) | Increase padding to 12 or add hitSlop |
| 12 | `app/(tabs)/digest.tsx` | 473 | `x` (chip remove) | ~21x21 (padding:5 + 11px) | 21x21 | Add hitSlop or increase padding |
| 13 | `app/(tabs)/digest.tsx` | 488 | `x` (ticker chip) | ~21x21 | 21x21 | Same as above |
| 14 | `components/FolderAddSheet.tsx` | 275 | `x` (clear search) | ~16x16 (no sizing) | 16x16 | Wrap in 44x44 Pressable or add explicit sizing + hitSlop |

**Total:** 13 elements below the 44x44pt minimum (1 passes with hitSlop).

---

### E03 -- Touch target below 48x48dp (Android Material, mobile)

Android recommends 48x48dp. All items from E02 also fail here, plus:

| # | File | Line | Icon | Effective size | Fix |
|---|------|------|------|---------------|-----|
| 1 | `app/stock/[ticker].tsx` | 857 | `arrow-left` | 38x38 + hitSlop:8 = ~54 | PASS |
| 2 | `app/(tabs)/index.tsx` | 466 | `chevron-down` (picker trigger) | ~31x21 (pH:12 + pV:7 + 12px icon) | Part of wider touchable row, acceptable |
| 3 | `app/(tabs)/alerts.tsx` | 92 | filter chips | ~36x26 (pH:12 + pV:7) | Increase vertical padding to 11 |
| 4 | `app/(tabs)/account.tsx` | 670 | delivery method buttons | flex:1, pV:8 | Width determined by flex; height ~30dp. Increase pV to 14 |
| 5 | `app/stock/[ticker].tsx` | 583 | `external-link` (read more) | pV:10, pH:12 = ~34x32 | Increase to pV:14, pH:16 |
| 6 | `app/stock/[ticker].tsx` | 869 | `bookmark` | pH:14, pV:8 = ~42x30 | Increase pV to 14 |

---

### E04 -- Missing `sr-only` / `aria-label` on web ToastClose

| File | Line | Icon | Fix |
|------|------|------|-----|
| `components/ui/toast.tsx` | 75-85 | `X` (close) | Add `<span className="sr-only">Close</span>` inside ToastClose, matching the pattern in dialog.tsx and sheet.tsx |

---

## WARNINGS (should fix)

### W01 -- Web `Button size="icon"` is 36px (below 44px iOS recommendation)

| File | Line | Definition | Fix |
|------|------|-----------|-----|
| `components/ui/button.tsx` | 28 | `icon: "h-9 w-9"` (36x36px) | Consider changing to `"h-10 w-10"` (40px) or `"size-11"` (44px) for touch-friendly targets. Web mouse users are fine at 36px, but if this component is ever used in a WebView or PWA on mobile, it would be undersized. |

**Used by:** `CarouselPrevious`, `CarouselNext` (carousel.tsx:217,246), `SidebarTrigger` (sidebar.tsx:267)

---

### W02 -- Calendar nav buttons lack explicit aria-label (web)

| File | Line | Icon | Fix |
|------|------|------|-----|
| `components/ui/calendar.tsx` | 141 | `ChevronLeftIcon` (prev month) | Verify DayPicker passes `aria-label="Previous month"` to button_previous. If not, add it in `classNames` config or via `components` override. |
| `components/ui/calendar.tsx` | 147 | `ChevronRightIcon` (next month) | Same for button_next with `aria-label="Next month"`. |

---

### W03 -- Emoji in interactive elements (platform rendering variance)

Emoji render differently across OS/browser. These instances use emoji inside or adjacent to interactive controls:

| File | Line | Emoji | Context | Risk |
|------|------|-------|---------|------|
| `app/(tabs)/account.tsx` | 558 | `⚡` | Upgrade button text | Renders differently on iOS vs Android vs web. Consider replacing with `Feather name="zap"` for consistency. |
| `app/(tabs)/account.tsx` | 563 | `⬆` | Upgrade button text | Arrow emoji varies by platform. Replace with `Feather name="arrow-up"`. |
| `components/PaywallSheet.tsx` | 163 | `⚡` | Badge text | Non-interactive but visually inconsistent cross-platform. |
| `components/PaywallSheet.tsx` | 166 | `🎉` | Badge text | Same concern. |

---

### W04 -- Resizable handle grip has no accessible hint (web)

| File | Line | Icon | Fix |
|------|------|------|-----|
| `components/ui/resizable.tsx` | 39 | `GripVertical` | Add `aria-label="Resize"` to the handle wrapper or set `aria-hidden="true"` if the resize handle has keyboard support via the Radix primitive. |

---

### W05 -- `expo-symbols` package installed but unused

| File | Evidence | Fix |
|------|----------|-----|
| `package.json` | `"expo-symbols": "~1.0.8"` | Remove from dependencies to reduce bundle size. No `SymbolView` or `IconSymbol` imports found anywhere. |

---

## INFO (observations)

### I01 -- All web icons are lucide-react SVGs (full cross-browser compatibility)

lucide-react renders inline SVG elements which work identically across Chrome, Firefox, Safari, and Edge. No icon-font loading, no FOUT, no platform-specific concerns. **No issues found.**

### I02 -- All mobile icons are Feather via @expo/vector-icons (full cross-platform)

The Feather icon set is bundled as a font with Expo and renders natively on both iOS and Android. No CDN dependency, no web-only icon fonts. **No issues found.**

### I03 -- No SF Symbols or platform-specific icons used

The codebase avoids iOS-only SF Symbols and Android-only Material Symbols entirely, using the cross-platform Feather set throughout. This is correct for cross-platform parity.

### I04 -- Icon sizing is consistent within each platform

- **Web:** Nearly all icons use `h-4 w-4` (16px) via explicit classes or the `[&_svg]:size-4` parent selector in `button.tsx`. Smaller variants (`h-2 w-2`, `h-3 w-3`) are used for indicator dots.
- **Mobile:** Icon sizes range from 11-36px depending on context (11-14 for inline/chip icons, 16-18 for standard buttons, 20-36 for empty states and headers). This is acceptable.

### I05 -- Cross-platform icon mapping (web vs mobile for same actions)

| Action | Web icon (lucide) | Mobile icon (Feather) | Match? |
|--------|------------------|----------------------|--------|
| Close/dismiss | `X` | `x` | Yes (same glyph) |
| Search | `Search` | `search` | Yes |
| Check/select | `Check` | `check` | Yes |
| Navigate back | `ChevronLeft` | `arrow-left` | Slight mismatch (chevron vs arrow) |
| Navigate forward | `ChevronRight` | `chevron-right` | Yes |
| Expand/collapse | `ChevronDown` | `chevron-down` / `chevron-up` | Yes |
| More options | `MoreHorizontal` | `more-horizontal` | Yes |

Both lucide and Feather share the same design lineage (Feather Icons), so glyphs are visually identical. **No consistency issues.**

### I06 -- Radix primitive components provide implicit ARIA on web

Checkbox indicators (`Check`), radio indicators (`Circle`), select indicators (`Check`), and menu sub-trigger chevrons (`ChevronRight`) in shadcn/ui components inherit accessibility semantics from their Radix UI primitive parents. These do **not** need explicit `aria-label` on the icon itself.

---

## Summary

| Metric | Web | Mobile | Total |
|--------|-----|--------|-------|
| **Files with icons** | 20 | 20 | 40 |
| **Total icon instances** | 30 | ~130 | ~160 |
| **Unique icon names** | 16 | 60 | 76 |
| **Cross-browser/platform rendering** | 30 pass | ~130 pass | ~160 pass |
| **Accessibility: PASS** | 29 | 2 | 31 |
| **Accessibility: FAIL** | 1 (ToastClose) | 26 | **27** |
| **Touch target: PASS** | 30 (web, mouse-based) | ~117 | ~147 |
| **Touch target: FAIL (iOS 44pt)** | 0 | 13 | **13** |
| **Touch target: FAIL (Android 48dp)** | 0 | 6 additional | **19** |
| **Consistency issues** | 0 | 0 | 0 |
| **Emoji warnings** | 0 | 4 | 4 |

### By severity

| Severity | Count | Description |
|----------|-------|-------------|
| **Error** | 46 | 27 missing a11y labels + 19 touch target violations |
| **Warning** | 8 | Button sizing, calendar labels, emoji, grip handle, unused package |
| **Info** | 6 | All rendering checks pass, good consistency |
