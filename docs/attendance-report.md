# 출결 현황 보고

Implementation: `Index.html` and `docs/index.html`, with shared report styling in `scripts/attendance-report.css`. This document describes the report modal, separate from the teacher-to-desk attendance submission flow.

## Operator workflow

Opening the modal selects the current hour clamped to schedule bounds. Previous/next moves within those bounds. The left column contains the report preview, image copy/save, compact text copy, and a collapsed read-only text preview. The right column contains student note editors and generated teacher-specific KakaoTalk text with individual copy buttons. These actions prepare content for manual pasting; they do not send messages.

The preview shows date/hour, late/nonparticipating/participating counts, and rows with student name, school, status, teacher, class type and note. Compact copied text uses student, teacher/class type and note. Empty reports and filters with no matching students have distinct explanations.

## Temporary notes and filtering

Report-only notes update the preview, exported image, report text and teacher messages immediately. They never write to the timetable or change attendance classification. Inputs allow up to 2,000 characters. Blank drafts display the original status as a fallback.

Drafts survive hour navigation and filter changes during one open session. Identity includes account/session, date, student, school, teacher, subject, class type, room and original note; it deliberately omits the hour, so a matching student/lesson record shares its draft across hours. A different date or original note does not inherit that draft. Closing or reopening resets drafts; reopening also resets the hour offset and filter.

“결석예고·당일취소 숨기기” hides those original display statuses from all outputs and editors. It does not classify students from edited prose. Visible late/nonparticipating totals follow the filter; participation remains the source-derived count. The exported footer discloses the exclusion.

## Teacher message cleanup

Messages group visible students by teacher name, remove a trailing `T`, skip unassigned teachers and deduplicate identical student lines. They retain school, date/hour, greeting and closing request. Cleanup applies only to teacher messages; report notes retain their entered wording.

Cleanup removes standalone `확정`, date-prefixed scheduling confirmations such as `10/3(토) 확정`, and scheduling administration phrases such as `시간표 입력 완료` or `수업 배정 확정`. Newline/semicolon/pipe segments are trimmed and joined with ` / `. Meaningful phrases such as `등원 시간 미확정`, `결석 확정` and arrival times remain. If cleanup removes everything, the original status is used. Operators can review the generated text before copying.

## Visual and keyboard contract

Follow the existing dense navy operations language in `DESIGN.md`. The modal is 1,180px wide with 40px viewport clearance and a 94vh maximum height. Its navy header (`#1c304a`), slate text (`#192b43`), pale working surface (`#f4f5f7`) and white paper preview use fine separators rather than nested cards. The preview has square corners, no shadow, a 560px maximum width and a stronger navy top-section divider. Late status uses rust text (`#a64917`) alongside its explicit label.

Desktop uses two equal columns with a 28px gap. At 760px and below, columns stack, modal corners become square, the maximum height becomes 100dvh and gutters reduce to 18px. Existing typography is retained: 24px modal title, 23px paper title, 16px student names and 12–14px supporting text. Date/hour labels use tabular numerals. Buttons have 40px minimum height and 5px corners; focus uses `#2365ae`.

The labelled modal moves focus to Close, wraps Tab/Shift+Tab through visible controls, closes on Escape and returns focus to its opener when still connected. Copy/export feedback is a polite live status region. No decorative animation is introduced.

## Export and fallback behavior

Text uses `navigator.clipboard.writeText`; when that API is absent, a temporary textarea and `execCommand('copy')` are attempted. Denied or failed copying instructs the operator to select the visible text and copy manually.

Images capture the white preview at 2× scale as PNG. Image clipboard support requires `clipboard.write` and `ClipboardItem`; unsupported browsers are directed to image saving. Clipboard/export failures show actionable feedback and restore the initiating button. Image saving downloads a date/hour filename and releases its object URL. During image capture, hour navigation, the hide filter and note editors are temporarily disabled to prevent those controls from changing the preview. Their previous disabled states are restored in `finally` after capture succeeds or fails; the initiating export button is also restored when its action finishes.

## Verification receipt

Local checks reported passing:

```sh
node scripts/attendance-report-test.cjs
node scripts/attendance-send-test.cjs
node scripts/toolbar-attendance-test.cjs
```

The report test covers script syntax and implementation parity, CSS inclusion, compact text, grouping/cleanup, original-note preservation, date isolation, filtering, escaping, empty states and clipboard success/denial/unsupported/export failure paths. Export tests also assert that preview controls are disabled during a failing render and restored after successful capture.

Run `node scripts/attendance-report-fixture.cjs` from the repository root for the synthetic report at `http://127.0.0.1:4194`. It uses invented students/teachers and no production attendance requests; image rendering loads html2canvas from its CDN. Browser verification was reported at 1440×1000 and 390×844, including successful text and image clipboard operations. Screenshots: `/private/tmp/attendance-report-desktop.png` and `/private/tmp/attendance-report-mobile.png`. The finish detector reported no findings. Independent review accepted shipment with an asynchronous preview-change caveat; the subsequent capture guard described above addresses that caveat. Deployment remains pending.

These receipts establish local synthetic behavior only. Production deployment and production verification are not claimed here.

Concurrent image copy/save actions share one capture promise; controls restore once. Closing the report waits for capture completion to keep the captured source stable.
