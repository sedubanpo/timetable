# Firebase card status storage

Firebase card storage implementation and controlled cutover runbook. Do not deploy a new dataset before rules and history import are ready.

## Data and access

- Config: `liveTimetableCardConfig/banpo`, server-managed `{activeDatasetId, migrationComplete:true}`.
- Current state: `liveTimetableCardStores/{dataset}/sheets/{sha256(JSON.stringify([trimmedSheetName]))}/statuses/{sha256(JSON.stringify([trimmedStudentName]))}`.
- Admin-only migration archive: `liveTimetableCardMigrationArchives/{dataset}/rows/{physicalRowNumber}`. It preserves every original physical row, including blanks and obsolete duplicates. This archive is not exposed to the web client.
- Current state stores sheetName, studentName, sent, server updatedAt, authenticated updatedBy UID, operationId, revision; imported records also preserve legacyUpdatedAt and legacyUpdatedBy.
- `sent` is the operator's delivery-complete mark, NOT a messaging-provider delivery receipt. This implementation preserves the old current-state semantics, not an append-only ledger of every future toggle.
- Existing exact trimmed student names (including suffixes) are preserved; no normalization or deduplication by school. A separate student-ID migration would need reconciliation of old names.
- A dataset identifies a source workbook/version. Use a new unique dataset for a replacement workbook; never silently reuse a yearless date namespace across years. The UI refuses a changed dataset until records are reloaded.
- Only active ADMIN/STAFF/DESK users with timetable access may read/write. Anonymous/teacher/retired/disabled accounts are denied. Config and archives cannot be written by clients. Security rules are maintained in the S-LMS repository's `firebase/firestore.rules`; its other uncommitted changes must not be deployed blindly.

## Runtime

The two card methods are intercepted before Apps Script routing on both HTML surfaces. They use the existing Firebase compat SDK directly. Reads require server responses; a missing migration config does not become an empty success. Writes use a transaction, server timestamp, UID and revision, with operation/dataset-aware confirmation. There is no silent fallback or dual write to the legacy sheet. Other timetable APIs remain on Apps Script.

## Controlled cutover (explicit approval required)

1. Confirm the actual source spreadsheet ID and choose a unique dataset ID. Back up the old deployment and Firestore rules. Arrange a short card-status maintenance window: stop old-browser writes, including already-open pages. Merely deploying a new page is not sufficient to stop old clients. Retire/disable the old card-write endpoint before the final snapshot, and wait for in-flight saves to finish. That endpoint-retirement change is a required release step, not executed by the importer.
2. With an authorized operator credential that can read the source, export a new private JSON snapshot. Install/use approved `google-auth-library` and set `GOOGLE_AUTH_MODULE` to its absolute module path; use Application Default Credentials, never embed credentials in source. `node scripts/export-card-history.cjs --spreadsheet SOURCE_ID --output PRIVATE_NEW_PATH.json`. The exporter uses Sheets read-only scope and creates a mode0600 file, refusing overwrite. Keep exports outside the public repository.
3. Run `node scripts/firebase-card-migration.cjs --input PRIVATE_NEW_PATH.json --dataset UNIQUE_DATASET`. This is offline dry-run: no Firebase initialization or credentials. It validates all rows and reports counts/fingerprint without names. Resolve malformed rows rather than silently dropping them.
4. Review and test the scoped Firestore rule addition. Use an authorized admin SDK credential and `FIREBASE_ADMIN_MODULE` absolute module path. Import with `--apply --project fir-lms-prod --confirm-project fir-lms-prod` added to the dry-run command. This writes only a new inactive dataset and raw archive. Partial runs may resume with the exact same snapshot. Existing different documents are never overwritten; already-active datasets reject import.
5. Check source is still frozen and the snapshot/counts are correct. Re-run the same import with `--apply --activate --project fir-lms-prod --confirm-project fir-lms-prod`. Activation is a separate explicit flag and occurs only after all create/compare operations succeed. Then deploy both UI mirrors and verify a permitted operator, a denied teacher and server-authoritative reads. Do not test by marking an actual uncontacted student sent.
6. Keep the legacy sheet and private export. If Firebase has accepted new writes, rollback cannot simply restore the old UI: first reconcile/export the new Firebase records to avoid silently losing those updates.

The legacy Apps Script setter now returns `CARD_STORAGE_MOVED` without accessing the sheet. Old clients must refresh after cutover; the old getter remains available for archived reads. Deployment-specific verification belongs in the release evidence; do not infer successful production migration from implementation tests alone.

## Source references

- Firestore transactions and offline failure: https://firebase.google.com/docs/firestore/manage-data/transactions
- Sheets formatted row export: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get

## Parent card redesign — 2026-10-17

The live card modal uses a student queue, editable preview, and explicit delivery status editor. Unsent status requires a 1–300 character reason; sent status clears it. `unsentReason` is stored with the existing Firebase delivery record and verified in the server confirmation. Legacy records without the field remain readable. Reasons are staff-only and never rendered in exported cards.

The preview and both PNG actions share `buildStudentExportHtml`. Notes are hidden by default; temporary note edits preserve newlines and are escaped. Note drafts do not alter original schedule times or persist after reopening the modal. Copying or downloading does not mark a card sent. Adjacent matching lessons merge, gaps become self-study, and only used building addresses appear. Registered subject/teacher images have bundled fallback icons.

Verification: `node scripts/firebase-card-checks.cjs`, `node scripts/card-reliability-checks.cjs`, and `node scripts/student-card-browser.mjs` (Playwright required; set `PLAYWRIGHT_MODULE` for a nonstandard installation and optionally `HTML2CANVAS_PATH` for an offline html2canvas 1.4.1 file). Browser fixtures use in-memory records and no production student writes.

## Separate annex guides — 2026-10-17

The card sidebar shows original annex PNG copy actions only for buildings used by the selected student's lessons. Timetable export is unchanged. Copy does not mark delivery; staff explicitly mark or undo guide completion. The snapshot API's `annex_guide_read` / `annex_guide_mark` actions authenticate active ADMIN/STAFF/DESK users and store independent, date-independent building records in `liveTimetableAnnexGuides`. Student keys use the timetable's exact student identifier/name (including disambiguation suffixes); hashes include the Banpo namespace. Each record contains building, completion state, server update time and authenticated actor. Lookup and teacher accounts are denied. The UI never treats a failed status read as an unannounced student.

Checks: `node --test snapshot-functions/annex-guides.test.cjs snapshot-functions/api-test.cjs` and `scripts/student-card-browser.mjs` cover persistence, building/student separation, undo, role denial, original PNG clipboard output and explicit marking. No live student records were modified for tests.
