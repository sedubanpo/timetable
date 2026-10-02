# Teacher dashboard

Implemented 2026-09-30 in `Index.html`; dashboard styling is scoped in `scripts/teacher-dashboard.css`. This change concerns the administrator's teacher dashboard only.

## Screen and interaction

The dashboard is a full-screen native dialog with a fixed header, tabs and search/action controls, and a separately scrolling content pane. Its compact navy ledger direction keeps operational comparisons in tables instead of repeated cards.

- **열람 확인:** four summary metrics precede the current schedule's teacher table. Unviewed teachers appear first; status filtering and search narrow the rows. History displays the selected timetable date. Overall average and highest/lowest view statistics remain available in a collapsed disclosure.
- **집계 수정:** administrator edit mode retains status/count overrides, save and restore-original behavior. Actual view records are preserved separately.
- **강의실 배정:** the selected month includes all matching timetable dates and a complete teacher table. Search, building filtering and name/hours sorting support inspection; each teacher's room disclosure exposes the full room breakdown. The building filter finds teachers using that building; displayed hours remain the teacher's total across buildings. Existing aggregation treats a timetable slot as one hour.
- Native dialog keyboard behavior and close/return focus remain available. Re-rendered status, history, building and sort selects use stable IDs and restore focus after selection.

## Date aggregate cache

Classroom statistics store per-date aggregate buckets in browser local storage, scoped by authenticated account, full date including year, and sheet name. They do not persist the complete timetable grid through this cache.

Today, future dates and non-final past captures are reusable for at most five minutes and only within the same Korean calendar day. A past date becomes reusable beyond that window only when its successful fetch occurred after the corresponding day ended in Korea. Any stored entry older than 120 days is rejected. Thus a capture made during the day is fetched again after midnight before being treated as a completed past date.

The room tab reports reused and fetched date counts. **전체 날짜 다시 읽기** bypasses cached daily aggregates and reads the entire selected month again, including past dates. Successful dates remain usable after a partial failure; failed dates are identified and can be retried. Session/context guards prevent superseded responses from updating another account or month, while request guards protect view-log results. A room-request generation guard stops further date reads after dialog close and rejects older requests after a same-context reopen; completed daily entries remain reusable on the next open. Logout clears the private room cache and in-memory dashboard data.

The cache belongs to this browser: it is not shared between computers or browser profiles. A browser without saved data needs initial reads. Later changes to finalized past timetables require the explicit entire-month refresh. Storage unavailability falls back to fetching; it does not create a shared server cache or a freshness guarantee.

## Implementation and QA receipt

The coordinating agent reports passing checks:

```sh
node scripts/teacher-dashboard-test.cjs
node scripts/firebase-card-verification.cjs
```

Synthetic browser QA used 1440×900 desktop and 390×844 mobile viewports. Captures are in `.impeccable/review/teacher-dashboard/`: `desktop.png`, `mobile.png`, `rooms-desktop.png`, and `rooms-mobile.png`. Desktop log and mobile room captures were also inspected during documentation. These fixtures demonstrate the tested layout and behavior; they are not measurements of production latency or production data correctness.

Independent review identified keyboard focus loss on re-rendered selects. Stable IDs and focus restoration were added for all four re-rendered selects. Subsequent browser verification changed the status filter from three missing teachers to eleven confirmed teachers while preserving focus on that select; Tab then moved to the history date selector. The independent reviewer scored that fix resolved with `disposition: ship` (the verdict covered the scored fix). On mobile, the classroom table intentionally requires horizontal scrolling to retain readable room detail columns.

## Monthly calendar and detailed view records — 2026-10-02

The view-confirmation screen now has a sticky monthly calendar on the left and the existing ledger on the right. It opens to the current timetable's month. Selecting a day filters the dated ledger, including a truthful empty state; month navigation handles year boundaries and the current-timetable button restores its date. Calendar figures use the loaded, effective view counts (including administrator adjustments) and remain stable during teacher searches. Viewing a different day does not claim to know that day's complete teacher roster or show unrelated current-day edit controls.

Each name in the current and dated tables has a keyboard-operable `▾` disclosure. It opens a full-width row with actual stored view timestamps, newest first, in Korean time. Original logs are filtered by teacher and sheet; generated override counts never become invented detailed events. An adjustment notice explains why raw event counts may differ from the summary. Login identifiers are not displayed.

At widths up to 800px, the calendar precedes the ledger in one column. Desktop and 390px synthetic checks covered date selection, empty dates, raw timestamp ordering, expansion, status filtering, and no page-width overflow. Existing cache/permission tests passed alongside calendar year-transition, escaping, raw/adjusted separation and disclosure checks. No new server request is made when selecting a date or expanding history. The mechanical detector's sole finding is the existing square underline tab border (not a rounded-card accent); it is retained deliberately.

Preview fixture: `node scripts/teacher-dashboard-fixture.cjs` at localhost:4192. Screenshots `/private/tmp/dashboard-calendar-desktop.png` and `/private/tmp/dashboard-calendar-mobile.png` use synthetic records, not production usage figures.
