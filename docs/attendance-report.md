# 출결 현황 보고

Implementation: `Index.html` and `docs/index.html`, with shared report styling in `scripts/attendance-report.css`. This document describes the report modal, separate from the teacher-to-desk attendance submission flow.

## Operator workflow

Opening the modal selects the current hour clamped to schedule bounds. Previous/next moves within those bounds. The left column contains the report preview, image copy/save, compact text copy, and a collapsed read-only text preview. The right column switches between “비고 편집” and “강사별 카톡 문구” tabs, opening on note editing. Teacher messages have individual copy buttons. On mobile, the sticky toolbar includes “카톡 문구 바로가기”, which selects the message tab, scrolls it into view and moves focus to it. These actions prepare content for manual pasting; they do not send messages.

The preview first places teachers without attendance issues in a compact four-column grid (two columns at 760px and below), showing each teacher’s combined counts and distinct room names aligned at the right of the teacher name. Classes whose original active/late/absent counts are all zero are omitted; teachers with no remaining classes are omitted too. A teacher qualifies only when every class has original `late + absent === 0`; filtering cannot move a teacher into this grid. Remaining teachers retain detailed subject/class type/room groups and student issue rows with name, school, status and note only when visible students remain. Both empty detail classes and teachers with no visible detail students are omitted, including within a mixed teacher’s classes. Teacher names are prefixed by unique-subject icons delegated to the existing `getSubjectBadgeHtml` account-icon/live-refresh path, retaining its emoji fallback. Class labels continue to use authored calculator, science-flask or book SVG icons. Overall, compact-teacher and class counts render as person icon × number in 출석/지각/불참 order; each has a descriptive `aria-label` and status `title`. A no-class state has an explicit explanation; filtered-out detail groups do not leave empty headings. Compact copied text retains its existing flat student · teacher/class type · note format; it does not include room names or grouped counts.

## Temporary notes and filtering

Report-only notes update the preview, exported image, report text and teacher messages immediately. They never write to the timetable or change attendance classification. Inputs allow up to 2,000 characters. Blank drafts display the original status as a fallback.

Drafts survive hour navigation and filter changes during one open session. Identity includes account/session, date, student, school, teacher, subject, class type, room and original note; it deliberately omits the hour, so a matching student/lesson record shares its draft across hours. A different date or original note does not inherit that draft. Closing or reopening resets drafts; reopening also resets the hour offset and filter.

“결석예고·당일취소·휴강 숨기기” hides student details with those original display statuses from the preview/image, editors, compact report text and teacher messages. It does not classify students from edited prose. Overall counts and the counts of displayed classes always retain their original source values, even when some detail students or classes are hidden; the exported footer states this distinction. 출석 is the existing source-derived count of students without a detected attendance issue, not a new check-in measurement.

## Teacher message cleanup

Messages group visible students by teacher name, remove a trailing `T`, skip unassigned teachers and deduplicate identical student lines. They retain school, date/hour, greeting and closing request. Cleanup applies only to teacher messages; report notes retain their entered wording.

Cleanup removes standalone `확정`, date-prefixed scheduling confirmations such as `10/3(토) 확정`, and scheduling administration phrases such as `시간표 입력 완료` or `수업 배정 확정`. Newline/semicolon/pipe segments are trimmed and joined with ` / `. Meaningful phrases such as `등원 시간 미확정`, `결석 확정` and arrival times remain. If cleanup removes everything, the original status is used. Operators can review the generated text before copying.

## Visual and keyboard contract

Follow the existing dense navy operations language in `DESIGN.md`. The modal is 1,480px wide with 40px viewport clearance and a 94vh maximum height. Its navy header (`#1c304a`), slate text (`#192b43`), pale working surface (`#f4f5f7`) and white paper preview use fine separators rather than nested cards. The preview has square corners, no shadow, a 680px maximum width and a stronger navy top-section divider. Compact cells and detailed teacher sections use distinct pale backgrounds: sorted teacher names receive successive 137.508° golden-angle hues at 55% saturation and 94% lightness within each report. These colors distinguish teachers and do not encode attendance status. Counts use green (`#137044`) for 출석, dark yellow (`#785100`) for 지각 and red (`#b12832`) for 불참. Count person icons are filled with `currentColor`, 21px beside 16px numerals; compact teacher cells use 18px icons and 14px numerals. Overall totals sit at the paper header’s top right with 27px icons and 21px numerals, reducing to 21px/16px at 480px and below. Student rows place the note inline to the right of name/school and immediately before the status, with wrapping inside the note column. Student status labels use pale yellow/dark yellow for lateness and pale red/dark red for nonparticipation; student status color accompanies visible text, while count meanings are supplied through `aria-label` and `title`.

Desktop uses a 1.1:1 column ratio with a 28px gap and a sticky navy header. The sticky right-side work area has separate tab panels capped at 66vh with internal scrolling. Selected tabs use a navy underline and square corners. At 760px and below, columns stack, modal corners become square, the maximum height becomes 100dvh and gutters reduce to 18px. The header and side area return to normal flow, side panels lose their height cap, and the toolbar stays at the top while scrolling. All modal text uses bold 700 weight: 24px modal title, 23px paper title, 17px teacher headings, 14px student names and 12px student notes; mobile modal/teacher headings reduce to 21px/16px; at 480px and below the paper title is 18px and date is 11px, and school text moves below the student name. Date/hour labels use tabular numerals. Buttons have 40px minimum height and 5px corners; focus uses `#2365ae`.

The labelled modal moves focus to Close, wraps Tab/Shift+Tab through visible controls, closes on Escape and returns focus to its opener when still connected. Copy/export feedback is a polite live status region. No decorative animation is introduced.

## Export and fallback behavior

Text uses `navigator.clipboard.writeText`; when that API is absent, a temporary textarea and `execCommand('copy')` are attempted. Denied or failed copying instructs the operator to select the visible text and copy manually.

Images capture the white preview at 2× scale as PNG. Image clipboard support requires `clipboard.write` and `ClipboardItem`; unsupported browsers are directed to image saving. Clipboard/export failures show actionable feedback and restore the initiating button. Image saving downloads a date/hour filename and releases its object URL. During image capture, hour navigation, Close, the hide filter and note editors are temporarily disabled to prevent those controls from changing the preview. Their previous disabled states are restored in `finally` after capture succeeds or fails; the initiating export button is also restored when its action finishes. Concurrent image copy/save actions share one capture promise, so controls restore once. Close/Escape cannot dismiss the report until capture finishes, keeping the source visible; a blocked close request shows feedback and must be retried afterward.

## Verification receipt

Local checks reported passing:

```sh
node scripts/attendance-report-test.cjs
node scripts/attendance-send-test.cjs
node scripts/toolbar-attendance-test.cjs
```

The report test covers script syntax and implementation parity, CSS inclusion, compact text, grouping/cleanup, original-note preservation, date isolation, filtering, escaping, empty states and clipboard success/denial/unsupported/export failure paths. Tests also cover teacher/class grouping, separate classes for one teacher, unchanged full counts when details are filtered, shared concurrent image capture, disabled preview controls during a failing render and control restoration after successful capture. New tests pass for source-based compact-group classification, shared subject-icon delegation and mixed-teacher filtering that removes empty detail classes while preserving source counts.

Run `node scripts/attendance-report-fixture.cjs` from the repository root for the synthetic report at `http://127.0.0.1:4194`. It uses invented students/teachers and no production attendance requests; image rendering loads html2canvas from its CDN. Browser verification was reported at desktop and 390px mobile widths, including successful text/image clipboard operations and note propagation. Latest density-refinement synthetic screenshots: `/private/tmp/report-density-desktop.png` and `/private/tmp/report-density-mobile.png`. The latest `node scripts/attendance-report-test.cjs` run passed. The synthetic fixture stubs subject icons; production account-icon rendering and exported-image fidelity have not been visually verified.

Finish review cleared the final filtering and 1440px/390px layout fixes. The detector reported one rounded-border-accent warning on the selected tab underline; inspection treats it as a false positive because the tab explicitly has `border-radius:0`.

These receipts establish local synthetic behavior only. The current density refinement has not yet been deployed or verified in production.
