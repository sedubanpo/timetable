# 시간표 스냅샷

## 구현

- Firebase Functions의 `timetableSnapshotEveryTwoHours`가 2시간마다 (한국시간 짝수 시각 정각) Apps Script 원본을 새로 읽어 한국시간 오늘·내일을 저장한다. 브라우저가 필요하지 않다.
- `timetableSnapshotApi`는 별도 HTTPS 조회 경로다. 조회는 Apps Script를 호출하지 않는다. 관리자 수동 저장만 원본을 호출한다.
- 날짜 화면 진입과 동시에 저장본과 원본을 병렬 조회한다. 저장본이 먼저 도착하면 즉시 표시하며 원본 성공 시 실시간 표시로 전환한다. 원본 실패 후에는 기존 60초 점검 주기에 다시 시도한다.
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

### 재점검 및 내결함성 개선 · 2026-09-28

- 이전 운영 실패 두 건은 14:32 UTC(28.10초), 14:35 UTC(36.60초)에 일반 `UNAVAILABLE`만 남겼다. 원본 요청 제한 75초보다 짧으며, 당시 로그로는 전송 오류·JSON 변환 오류·Firestore 오류를 확정할 수 없다. 타임아웃으로 단정하지 않는다. 14:41 UTC 실행은 HTTP 200, 16.09초에 완료됐다.
- 9/29 00:00 KST 구 버전 작업에서 실패가 재현됐다. `snapshotSourceFormat`에 HTTP 200 / `text/html; charset=utf-8`이 기록되어 Apps Script 원본 경로가 JSON 대신 HTML을 반환했음을 확인했다. 이 재현의 실패 지점은 확정됐지만, 앞선 두 실행도 같은 내부 원인이었는지는 소급 확정할 수 없다. 00:03 KST 새 버전 실행은 15.39초에 정상 완료되어 9/29·9/30 두 건 저장을 확인했다. HTML 본문은 저장하지 않고 실행 제한/요청 제한/인증 페이지/Google 오류 페이지 등의 고정 분류만 기록하도록 보강했다.
- 00:08 및 00:09 KST 재현에서는 원본 `script` 경로의 HTML이 `RATE_LIMIT`으로 분류됐다. 이는 요청 제한 문구 탐지 결과이며 Google의 구체적인 할당량 종류/수치는 확인하지 못했다. 00:09 실행은 첫 실패 후 약 60초 뒤 자동 재시도가 실제로 이루어진 기록이다. 원본 호출 압력을 줄이기 위해 2시간 이내의 인증된 날짜 목록이 있으면 로그인/HOME에서 원본 목록을 다시 조회하지 않는다. 새 날짜는 목록 새로고침 버튼으로 조회할 수 있다. 일반 캘린더 날짜 진입·백업 복구 점검은 원본의 버전 확인 캐시를 사용하며, 사용자가 누른 새로고침과 스냅샷 저장은 원본 강제 읽기를 유지한다.
- 자동 저장은 기존 2시간 주기를 유지하고 실패 시 60~120초 간격으로 최대 두 번 재시도한다. 최대 재시도 기간은 0으로 설정해 횟수 제한을 정확히 적용한다. 수동 저장과 겹치는 자동 작업도 조용히 건너뛰지 않고 재시도한다. [Cloud Scheduler 재시도 설정](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs)
- 9/29 00:11:45 KST 시작한 두 번째 자동 재시도는 00:12:18에 HTTP 200으로 완료됐다(32.41초, 저장 2건). 수동 개입 없이 재시도로 복구되는 것을 운영 로그에서 확인했다.
- 실행 ID, 단계(임대/원본/검증/저장/목록/임대 해제), 안전한 오류 분류, 소요 시간만 기록한다. 개인정보·비밀값·원본 본문·원시 오류 메시지는 기록하지 않는다. 실패해도 마지막 정상 백업은 유지된다.
- 엑셀 및 이미지 출력 라이브러리의 초기 `defer` 스크립트를 제거하고 내보내기를 누를 때 로드한다. 기존에는 이 스크립트가 `DOMContentLoaded`와 로그인/SSO 초기화를 지연시킬 수 있었다. 인증 SDK 로딩에는 20초 제한과 실패 후 새 요청으로 재시도하는 경로를 추가했다.
- 같은 날짜의 유효한 화면이 있으면 갱신 중 오버레이를 표시하지 않는다. 늦게 온 백업이 이미 표시 중인 원본 결과를 덮지 않으며, 원본 도착 시 스크롤을 보존한다. 권한 거부는 백업뿐 아니라 원본 메모리 캐시도 비운다.
- HOME은 로그인한 사용자를 캘린더로 돌려보낸다. 캘린더에 로그아웃을 표시하고 날짜를 Enter/Space로 선택할 수 있다.
- 합성 CDN 지연 2초 시험: 기존 DOM 준비 2,050ms → 변경 후 17ms. 실제 Firebase 로그인 전체 시간이나 현장 기기 성능 수치가 아니다.
- `scripts/entry-flow-ui-fixture.cjs`: 실제 페이지 UI에 합성 인증/시간표를 제공하고 원본 응답을 멈춘 채 PC와 390×844 모바일 흐름 검증. 모바일 문서 폭 390px, 백업 갱신 중 오버레이 없음, 실시간 라벨 복구 및 HOME 복귀 확인. 경고/오류 콘솔 없음. 자동 디자인 검사는 기존 전체 화면의 경고를 포함하므로 전체 디자인 무결성을 의미하지 않는다.
- 추가 테스트: `node scripts/entry-resilience-test.cjs`, `node scripts/fast-entry-test.cjs`, `node scripts/snapshot-lifecycle-test.cjs`, 서버 12개 테스트(HTTP 200 HTML 거부·기존 백업 보존·복구 포함) 및 기존 17개 성능/기능 회귀 테스트 통과.

### 빠른 진입 개선 · 2026-09-28 배포

- Firebase 로그인 직후 `bootstrap`으로 ID 토큰 폐기 여부·ACTIVE 상태·앱 권한을 검증하고 날짜 메타데이터를 함께 받는다. 이 경로는 Apps Script를 호출하지 않는다. API의 401/403은 즉시 차단하고, 통신 장애에만 기존 인증 경로를 사용한다.
- 자동·수동 저장 시 전체 날짜 목록 메타데이터도 갱신한다. 학생 데이터는 포함하지 않으며 서버 전용 문서에 저장한다. 목록이 아직 없으면 24시간 이내 백업이 존재하는 날짜를 제공한다.
- 강사 직접 로그인은 모드 선택을 생략한다. 허브 로그인도 원본 날짜 목록을 기다리지 않는다. 날짜 목록은 먼저 표시하고 원본 목록을 백그라운드에서 갱신한다. 계정 변경 후 늦게 도착한 응답은 무시한다.
- 첫 진입 시 전체 시트의 강사 수업을 강제로 순회하지 않는다. 날짜별 실제 수업은 해당 날짜를 열어 확인한다. 백업이 없는 날짜는 원본 조회가 필요하다.
- `node scripts/fast-entry-test.cjs`: 원본 응답을 미완료 상태로 유지한 채 캘린더 표시, 지연 응답의 화면 이동 방지, 권한 거부·통신 실패 분기 및 즉시 스냅샷 조회 검증.
- 합성 타이밍 기준: 스냅샷 조회 전 고정 대기 8,000ms → 0ms. 실제 운영 계정의 전체 로그인 시간 측정은 배포 후 확인이 필요하다.
- Apps Script v240 및 전용 Firebase 함수 업데이트 완료. 운영 bootstrap API에서 무인증 401, 서명 인증 날짜 목록 200 응답을 확인했다. 이는 실제 강사 계정의 전체 로그인 시간 측정과는 별개다.

`node --test snapshot-functions/test.cjs`

`node scripts/snapshot-server-test.cjs`

`node scripts/snapshot-client-test.cjs`

`node scripts/snapshot-lifecycle-test.cjs`

`node --test snapshot-functions/api-test.cjs`

`node scripts/firebase-card-verification.cjs`

실제 운영 서버 지연을 재현한 시험이 아니라 합성 데이터 기반 테스트다. 브라우저 UI 검증도 개인정보 없는 로컬 fixture를 사용한다.
