# 시간표 스냅샷

## 구현

- Firebase Functions의 `timetableSnapshotEveryTwoHours`가 2시간마다 (한국시간 짝수 시각 정각) Apps Script 원본을 새로 읽어 한국시간 오늘·내일을 저장한다. 브라우저가 필요하지 않다.
- `timetableSnapshotApi`는 별도 HTTPS 조회 경로다. 조회는 Apps Script를 호출하지 않는다. 관리자 수동 저장만 원본을 호출한다.
- 현재 날짜 화면에서 8초 이상 기다리면 저장본을 조회하고 원본 응답도 계속 기다린다. 원본 성공 시 저장본 표시를 해제한다. 원본 실패 후에는 기존 60초 점검 주기에 다시 시도한다.
- 저장본은 서버가 확인한 날짜/시트로 구분한다. 2시간 이상 경과 시 경고하고 24시간 초과 또는 잘못된 형식은 제공하지 않는다. 메모·출결 전달함은 포함하지 않는다.
- 학생 정보가 있는 원본은 서버 전용 Firestore `liveTimetableSnapshots`에만 보관한다. 클라이언트 직접 읽기/쓰기 규칙을 추가하지 않는다. API에서 매 요청 Firebase ID token(폐기 여부 포함), ACTIVE 상태, 앱 접근 권한을 검증한다. 강사는 본인 이름과 단일하게 매칭된 수업 셀만 받는다. 관리자의 강사 미리보기도 필터링한다. 조회용 2371은 기존 조회 화면 권한을 유지하되, 서명된 6시간 유효 토큰으로 접근한다. 전체 강의실 응답에는 학생/비고가 없다.
- 수동 저장은 ADMIN만 허용한다. 실제 화면의 학생 데이터를 업로드하지 않으며, Apps Script가 반환한 서명 요청의 결과만 저장한다.
- 전역 쓰기 임대로 자동/수동 저장 겹침을 막는다. 불완전·실패 응답과 오래된 응답은 마지막 정상본을 덮어쓰지 않는다. 저장 시점은 원본 읽기 시작 시각이다.

## 배포 설정

1. 32자 이상의 충분히 무작위인 동일 비밀값을 Apps Script 프로젝트 속성 `TIMETABLE_SNAPSHOT_SECRET`과 Firebase Secret Manager의 같은 이름에 설정한다. Git, 프런트엔드, URL, 터미널 출력에 값을 남기지 않는다. 이 값은 서버 간 요청과 조회용 토큰의 서명에만 쓴다.
2. 현재 운영 Firestore 규칙에서 `liveTimetableSnapshots`와 `liveTimetableSnapshotJobs`가 모든 클라이언트에 대해 읽기/쓰기 거부되는지 확인한다. 공개 접근을 허용하지 않는다. Functions 실행 서비스 계정에 해당 프로젝트 Firestore/Secret Manager 접근 권한이 필요하다.
3. `snapshot-functions`에서 `npm ci`를 실행하고, 이 저장소의 `firebase.snapshots.json`으로 새 codebase만 배포한다: `firebase deploy --config firebase.snapshots.json --project fir-lms-prod --only functions:live-timetable-snapshots`. 기존 S-LMS functions/codebase/rules를 배포하거나 삭제하지 않는다. Cloud Scheduler/Functions 사용료가 발생할 수 있다.
4. Apps Script 및 GitHub Pages 변경도 함께 배포한다. 조회용 계정은 새 서명 토큰을 받기 위해 다시 로그인한다.
5. 관리자 저장 버튼으로 성공본을 생성한 뒤, 자동 스케줄의 성공과 데이터 생성시각을 확인한다. 읽기 API의 401/403, 강사 필터, 오늘/내일 날짜, 저장 실패 시 기존본 유지, 브라우저 지연 시 저장본 표시 및 복구를 운영 계정으로 확인한다.

정적 페이지 변경만으로 자동 저장이 켜지지 않는다. Secret/Functions/Scheduler 설정과 최초 저장 성공을 모두 확인한 후 활성화 완료로 보고한다. 새 로그인 자체가 Apps Script 장애로 실패하는 문제나 아직 저장하지 않은 날짜는 이 기능으로 복구하지 못한다.

## 운영 확인 · 2026-09-28

- Apps Script v239: 서명 설정 완료 후 일회성 설정 경로 제거.
- 전용 Firebase codebase의 조회 API 및 `timetableSnapshotEveryTwoHours` 배포 완료. 한국시간 짝수 시각 정각에 오늘·내일 저장.
- 운영 Firestore 규칙의 기본 거부 확인. 기존 다른 서비스 규칙·함수는 변경하지 않음.
- 최초 자동 작업 실행으로 9/28·9/29 저장 문서 생성 확인. 인증 없는 HTTPS 조회는 UNAUTHORIZED.
- 화면은 실시간 시간표 / 백업 시간표 라벨을 표시하고, 백업에는 저장 시각과 재시도 버튼을 제공함.

## 로컬 검증

`node --test snapshot-functions/test.cjs`

`node scripts/snapshot-server-test.cjs`

`node scripts/snapshot-client-test.cjs`

`node scripts/snapshot-lifecycle-test.cjs`

`node --test snapshot-functions/api-test.cjs`

`node scripts/firebase-card-verification.cjs`

실제 운영 서버 지연을 재현한 시험이 아니라 합성 데이터 기반 테스트다. 브라우저 UI 검증도 개인정보 없는 로컬 fixture를 사용한다.
