# Live Timetable Design Tokens

## Dense timetable refresh — 2026-09-12

Preserve the operations board, room/time axes and existing subject/status colors. Lesson headers place a compact navy subject/type stack beside the full teacher name, not above a separate teacher line. The stack uses 3px corners, 2px/3px padding and .58rem type; teacher names use .75rem and may wrap without truncation. Student rows use a two-column grid: name above school/grade in the left `.student-info` region, and upright vertical status labels at right. Status labels keep their existing colors, 3px corners and a 24px minimum height, without added animation or shadow. Name controls inherit row typography, have visible accent focus and underline on hover.

One-to-one lessons use a 2px inset gold boundary (`#b58a2e`), with teacher color `#654b16`. Their CSS fallback surface is `#fff9e9`; rendered lessons retain the inline teacher-hash pastel background, so the gold boundary does not imply a uniform gold surface. Selected student rows instead use a 3px strong-blue outline (`#0755b3`, offset -2px) over `#dbeafe`, plus a blue identity region with white name/school text and an underlined name. Red cancellation/status labels remain distinct (`#fee2e2` / `#991b1b` when selected). NEW rows retain a separate 1px accent border and small NEW text. Neither selection nor export changes source attendance; selection continues to use school-qualified student identity.

Preserve full-width desktop comparison and existing mobile horizontal scrolling; horizontal scrolling belongs to the timetable, not the toolbar. Toolbar action groups wrap within their available width, while individual button labels stay intact. Row contents wrap within the column instead of clipping. Note bubbles retain their existing 220px reading width independent of narrow columns. Calendar controls follow the existing teacher-picker tokens (6px controls, 8px panel, white/navy, 44px date targets), Monday-first, without animation.

The login gate keeps the form immediately visible on a solid navy canvas (`#0b1637`) with a `#14254b` panel, 16px corners and `0 24px 64px rgba(0,0,0,.28)` shadow; no backdrop blur. The panel is at most 440px wide with 40px viewport clearance, 40px padding (28px at widths up to 480px), and top alignment in viewports no taller than 650px. Inputs use `#0b1938`, `#415477` boundaries, white text, 8px corners and a 48px minimum height. Primary buttons pair `#dbeafe` with `#14254b`; visible focus uses `#93c5fd`. Supporting copy uses `#becce6`, labels `#d6e1f4`, and placeholders `#acbddc`.

Login feedback is indeterminate: a 4px track with a moving `#93c5fd` segment and factual pending text, never an invented percentage or simulated success. Pending disables the submit button and exposes `aria-busy`; completion/retry text follows the actual result. Reduced motion replaces segment travel with a static subdued fill while retaining busy feedback. Authentication deadlines, retries and permissions remain unchanged.

## Teacher search and narrow toolbar — 2026-09-08

Keep the compact operations toolbar. The admin teacher picker reuses the navy primary, accent focus ring, white/bg surfaces, 6px control radius and 8px spacing. The popover has 8px padding/radius, a 280px preferred width clamped inside the viewport, and a 240px scrolling option region. Its input and options have 44px targets. No animation. Native select remains a hidden state adapter; keyboard-operable buttons own selection, Escape returns focus. At narrow widths the main search occupies its own row; border-box sizing prevents padding from spilling outside its container. Toolbar actions wrap independently of the two-dimensional timetable.

## Annex direction images — 2026-09-08

For lookup lessons in 2관 and 3관, show the user-supplied PNG unchanged instead of the main-building SVG. The image scales to panel width with its original aspect ratio and no crop; a labelled original-image link permits full-size inspection in a separate tab. Keep the assigned classroom title and destination address as HTML text even if the image cannot load. Addresses are supplied by the approved images: 2관 반포쇼핑타운 2동 5층; 3관 반포쇼핑타운 3동 4층. Reuse existing primary/SEDU blue and spacing. No new animation, dependency, authentication or timetable data changes.

## Visitor wayfinding — 2026-09-08

The supplied academy plan is authoritative for main-building room topology: office and room 9 at left; desk above the origin; rooms 1–4 above the corridor; rooms 8,7,6 below it; room 5 at right; entrance below the desk. Use an authored SVG diagram, not a raster image edit. Preserve the existing Pretendard stack and navy palette. Map tokens scoped to `.visitor-floorplan`: wall `--primary`, room surface `--bg`, selected room and route `--sedu-blue`, on-selected white, empty-room surface #f0fdf4 and text #166534 (existing study palette). Walls use 3 SVG units; route uses 5 units, room type 20 units, map captions 15 units. ViewBox 1000×470 follows the approved geometry, with origin (330,230) directly in front of the desk. Minimum diagram width 560px preserves readable room names; only the labelled map region scrolls on narrower screens.

Selected destination uses fill plus a textual destination label, not color alone. One 700ms path reveal runs on destination change; reduced motion displays the complete route immediately. No perpetual pulse, no layout animation, no route before selection, no invented inter-building path. A static arrow and plain-language desk-to-door instruction remain after animation. Repeated rendering with unchanged map content preserves the SVG and scroll position.

## 1. Atmosphere / signature

Live Timetable is a dense operations board. Information stays compact and calm, while a condition that requires a desk operator to stop and act is marked with one decisive rose-red warning treatment. Do not introduce decorative gradients, cards, or new visual families for operational warnings.

## 2. Color

| Token | Value | Role |
| --- | --- | --- |
| `--primary` | `#0f1746` | Primary navigation and headers |
| `--secondary` | `#004d40` | Secondary navigation |
| `--accent` | `#3b82f6` | Informational action accent |
| `--bg` | `#f8f9fa` | Application canvas |
| `--border` | `#e5e7eb` | Standard boundary |
| `--sedu-blue` | `#024C9B` | Product blue |
| `--status-alert-bg` | `#fff1f2` | Inactive enrollment warning surface |
| `--status-alert-border` | `#fb7185` | Inactive enrollment warning boundary |
| `--status-alert-text` | `#9f1239` | Inactive enrollment warning text |
| `--status-alert-badge` | `#be123c` | Inactive enrollment warning label |
| `--status-alert-on-badge` | `#ffffff` | Warning badge text |

The warning text and border colors are deliberately darker than the surface and meet the compact-control contrast requirement against their paired backgrounds.

## 3. Typography

Use the existing `Pretendard, sans-serif` operational stack. Standard student row: `0.85rem / 500 / 1.3 / 0`. Warning label: `0.64rem / 800 / 1.2 / 0`. Do not add a display typeface.

Apply antialiased font smoothing to the application shell. Time, countdown, and other changing numeric values use tabular figures so their width does not shift while updating. Headings may balance their line wraps, but compact table labels must retain their existing single-line behavior.

## 4. Spacing

Base unit: `4px`. Existing timetable row spacing is retained. Warning badge uses `--space-1` (`4px`) horizontal separation and `--space-half` (`2px`) vertical optical padding. No new layout spacing is introduced.

## 5. Components

`Enrollment alert`: existing student row, plus a `1px` solid `--status-alert-border`, `--status-alert-bg`, and a compact status label with `--status-alert-badge`. The label is factual only: `중지`, `보류`, `퇴원`, or `등록 상태 확인`. Hover keeps the current row elevation. In compact mobile teacher views, use the same border/surface with the status label alongside existing status chips.

## 6. Motion

No new motion is used for enrollment alerts. Existing hover transitions remain transform/opacity/shadow only. Reduced motion therefore needs no additional exception.

Primary compact controls use a `--press-scale` value of `0.96` for pointer press feedback. Login controls use 160ms feedback and gate controls use 180ms feedback. The existing teacher-view switch retains its 200ms explicit-property transition. The interaction is disabled for controls that are loading or disabled, and transition properties remain explicit.

## 7. Depth

The timetable uses compact borders as its primary depth system. Enrollment alerts use border and tonal contrast only, with no glow or new shadow.

## 8. Tomorrow review dashboard

The review modal is a dense operational surface, not a separate visual product. Its primary region is an error timetable with the same time × room mental model as the live timetable. Navy headers retain the existing navigation authority; rose surfaces identify immediate errors and amber surfaces identify review-level warnings. Table boundaries remain `1px` dividers because they encode coordinates. Nested issue cards use low-opacity ring and depth shadows rather than another hard container border.

The hierarchy is fixed: summary metrics → current-error timetable → next review stages and source status. Error cards always expose issue type, class type/subject, teacher, affected student, and a corrective reason. At narrow widths the modal and secondary dashboard stack vertically, while the two-dimensional error timetable keeps sticky time/room headers and scrolls inside its named region. Interactive tabs and close controls keep at least a `40px` hit area and use the existing `0.96` press scale.
