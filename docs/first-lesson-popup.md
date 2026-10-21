# Live Timetable 첫수업 정보

## Scope and presentation

This extends the incumbent compact blue operational (Operate) interface. Logged-in administrators and teachers can open ordinary S-LMS first-lesson records for timetable students marked `신규생` or `첫수업`. Lookup mode is excluded. The feature is integrated into both `Index.html` and `docs/index.html`; its source fragments are `scripts/first-lesson-popup.fragment.js` and `scripts/first-lesson-popup.css`.

After the timetable renders, an automatic notice lists the distinct visible target students using timetable data only. The notice sits in document flow below the top bar, so it does not cover timetable cells. Its student list scrolls horizontally when necessary. Users can collapse the notice for the current context. An empty target result hides it.

The detail dialog opens only when a user selects a notice student or a timetable `첫수업 정보` button. It presents the student name and school, record author and date, and plain-text content. The notice does not automatically fetch student records.

## Responsive and keyboard behavior

The dialog is at most 640 px wide, with viewport margins and a maximum height of 80 dvh. At widths up to 600 px, it uses a narrower viewport margin and a maximum height of 76 dvh. The content region scrolls internally; the header close button and footer retry button remain visible in the reviewed desktop, mobile, and small-phone layouts. Notice and dialog buttons have a minimum height of 44 px; timetable triggers receive that height on mobile.

The native modal dialog has an accessible title, initially focuses its close button, and supports Escape and backdrop dismissal. The content region is keyboard-focusable and announces asynchronous content changes politely. Focus returns to the actual opening control, including a notice button, when the dialog closes. The data target and focus opener are stored separately, and retry preserves the original opener. Internal replacement closes without explicitly restoring focus. Visible keyboard focus outlines use the existing blue palette.

## Data and authorization

Reads use the existing review authorization and Firebase identity. This feature adds no permission rules or access grants; backend rules remain authoritative.

Student resolution uses bounded exact-name queries against `students.studentName` and `students.name`, deduplicates matches, and uses normalized school information when available. It refuses ambiguous, missing, or inactive matches rather than choosing a namesake. After resolving one student, it queries ordinary `studentLogs` by that student's ID. Only records tagged `첫수업정보` are displayed, newest first. It does not read a separate first-lesson collection or scan all students or logs. The bounded log query refuses to display an incomplete result when the limit is exceeded.

Record text is inserted with `textContent`. Loading disables retry. Empty results explain that no first-lesson information is registered. Errors distinguish expired login, denied access, ambiguous or missing students, enrollment-state problems, record limits, timeout, and other failures, with Korean recovery guidance. Requests time out after 8.5 seconds and can be retried.

## Cleanup and validation limits

Request sequence and context checks reject stale results. Closing aborts pending requests, clears timers, and removes displayed record content. Existing review invalidation also invalidates first-lesson state; page exit performs cleanup. Context includes the schedule session, sheet, teacher, and administrator state.

Visual review used the actual HTML with synthetic data and blocked external network access. Evidence covers desktop, mobile, and small-phone notice and long-record detail states in `evidence/first-lesson/`. The blocked external logo is an existing resource limitation of that fixture. The implementation owner reports browser regression coverage for restoring focus to the notice opener on Escape and removing the notice after an empty result. Production APIs, real student data, and production authorization have not been verified by this review.

## Implementation verification — 2026-10-21

- Source baseline: GitHub Pages main `94392e77c16c73b9434e726796783bbd2f93c59b`; public index.html byte-matched before work. Isolated branch `codex/first-lesson-popup`; existing dirty live-timetable checkout was not edited.
- `first-lesson-popup-test.mjs`: desktop 1440×900, mobile 390×844, small phone 320×568; synthetic first-lesson text, notice without network reads, school matching/ambiguity, filtered tags, plain-text XSS safety, 401/403/empty/limit, 8.5-second timeout, cancellation, role gating, viewport bounds, internal scroll, Escape/focus restoration, and no-target notice removal passed.
- Existing regression: 28 Node contract tests, 27 review browser scenarios, review-checks, enrollment checks, export freshness checks, both HTML syntax and diff checks passed.
- Finish review: focus-return finding fixed and re-reviewed as resolved; no other material findings in the inspected scope. Mechanical detector returned no findings for the new CSS/module.
- Tests block all external browser requests before loading; Firebase responses are synthetic and assert the demo project. No production student records, writes, Functions deployment or security configuration changes were used.
- Automatic target notice appears in layout after timetable rendering; it does not automatically open the modal or read students' detailed records. The user's requested automatic target announcement is implemented this way to avoid covering timetable cells.
