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
