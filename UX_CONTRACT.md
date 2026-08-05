# Tomorrow Timetable Review UX Contract

## Scope and baseline

- Target: browser-hosted operational Web UI, `내일 시간표 점검` modal.
- Primary user: desk operator preparing the next day's timetable and outbound cards.
- Baseline evidence: the current production modal repeats the same issue across summary, priority, group, and send lists; its current-error tab reduces each issue to a flat sentence and loses the class/teacher/student relationship.
- Desired outcome: the operator can locate and understand every current-table issue by time and room before moving to comparison, exam/jikbo, or send preparation.
- Adjacent journeys at risk: weekly comparison, external-data review, exam timetable subtabs, send-preparation actions, modal scrolling, and mobile access.

## Journey and spatial ownership

1. Open `내일 시간표 점검` from the main timetable.
2. Read six summary indicators and the issue timetable preview.
3. Inspect a cell by time and room; read issue, class/subject, teacher, student, and corrective reason together.
4. Use tabs for current errors, weekly changes, exam/jikbo, and send preparation.
5. Close the modal and return to the unchanged live timetable context.

The modal owns vertical scrolling. The error timetable owns its two-dimensional scrolling and preserves sticky time and room coordinates. The overview shows only rooms containing issues; the full current-error tab preserves all room columns. At narrow widths the lower dashboard stacks, but the timetable remains spatial rather than becoming an ambiguous flat list.

## Invariants and states

- `확인필요` keeps its exact hour, room, class type, subject, teacher, and affected student.
- Duplicate detection groups only the same normalized name and same school/grade; a same-name student at another school/grade is not grouped.
- One-hour warnings retain the only occurrence's exact class context.
- Empty current-error state explicitly reports that no current-table error was found.
- External enrollment warnings are placed at every matching current occurrence when location data exists; unplaceable external items remain visible below the timetable.
- Existing weekly comparison, exam/jikbo, source-state, and send-preparation capabilities remain reachable.
- Tabs expose selected state; the modal exposes dialog semantics; no added interaction depends only on pointer input.

## Traceability

| Contract | Owner | Verification | Evidence |
| --- | --- | --- | --- |
| Preserve structured issue context | `buildReviewSnapshot`, `addCurrentSnapshotIssues` in `Index.html` | synthetic review fixtures | `scripts/review-checks.js` |
| Render time × room error surface | `renderReviewCurrentTimetable` in `Index.html` | semantic HTML assertions and real-browser captures | Superloopy frontend evidence |
| Preserve existing feature reachability | `renderReviewIssues`, `setReviewTab` in `Index.html` | tab interaction and regression checks | Superloopy loop artifacts |
| Adapt desktop/mobile without losing coordinates | review timetable and breakpoint CSS in `Index.html` | desktop and mobile real-browser inspection | `VISUAL_QA.md` |

## Evidence limits

Automated fixtures prove grouping, context retention, output structure, and mirror integrity. Browser captures prove rendered geometry for the inspected states, not broad user preference or real-world error prevalence.

## Extended operating-hour addendum

- The daily timetable, student card, timesheet export, teacher/attendance views, review snapshot, and lightweight API share one inclusive source range: 08:00 through 23:00 (the final slot ends at 24:00).
- The existing `9시 OFF` control may hide a summary-only 09:00 row, but it must never hide a 09:00 row containing an actual student lesson.
- Consecutive 08:00 and 09:00 entries for the same lesson merge to 08:00–10:00. Consecutive 22:00 and 23:00 entries merge to 22:00–24:00.
- Midnight is displayed as `오전 12:00` in exported timesheets and student-facing schedule cards.
- Extending the time range adds rows only when source data exists; it does not change column widths, timetable hierarchy, late-night access control, or responsive scroll ownership.

| Extended-hours contract | Owner | Verification | Evidence |
| --- | --- | --- | --- |
| Parse and serve 08:00/23:00 source blocks | `getFixedGridData`, `toLitePayload_` in `Code.gs` | mixed-meridiem and boundary fixtures | `scripts/review-checks.js` |
| Show early lessons in the daily timetable | `renderTable` in `Index.html` | real-data browser inspection | Superloopy frontend evidence |
| Include boundary lessons in cards and timesheets | `buildStudentImageMap`, `exportScheduleToExcel` in `Index.html` | merged 08:00–10:00 and 22:00–24:00 assertions | `scripts/review-checks.js` |
