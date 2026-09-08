# Live Timetable Design Tokens

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
