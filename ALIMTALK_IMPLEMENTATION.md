# 시간표 카드 SOLAPI 연동 — 모의 구현 및 운영 연결 제안

작성일: 2026-10-28 (한국시간)

## 1. 결과와 경계

**로컬 모의 구현 완료. 운영 연결·새 서버 구축·실제 발송·배포는 하지 않았다.**

사용자의 후속 지시에 따라 확인되지 않은 데이터 연결을 추정하지 않았다. 운영 시간표 응답에 학생 ID가 없으므로 실제 카드 화면의 알림톡은 학생 ID 매핑 필요 상태로 보류한다. 실사용 가능 연동을 완료했다고 주장하지 않는다.

- Git 저장소: `https://github.com/sedubanpo/timetable.git`
- 기준 HEAD: `064b0d4821c40f8fdb1ca9970c3b1734da0bb94a`
- 별도 작업 트리: `/Users/anjongseong/Documents/New project/live-timetable-alimtalk-20261028`
- 브랜치: `codex/timetable-alimtalk-20261028`
- 기존 운영·조사 작업 트리는 보존. 이번 변경은 push/commit/deploy하지 않음.
- 기존 `snapshot-functions/index.js`, Code.gs, Firebase 설정·규칙·인덱스·예약은 변경하지 않음.
- SOLAPI 키·Secret 접근/생성/등록, 충전, 실제 메시지 및 테스트 웹훅 전송 없음.

## 2. 승인 템플릿 확인

기존 로그인된 SOLAPI 콘솔에서 **읽기 전용 UI**로 상세를 열었다.

- [확인한 상세](https://console.solapi.com/kakao/templates/KA01TP261028065644021KW04bfNV32J)
- 템플릿명: 에스학원 반포 하루 수업 상세 안내
- templateId: `KA01TP261028065644021KW04bfNV32J`
- pfId: `KA01PF261023080711057TMM3XbQDxHN`
- 상세 상태: **발송에 사용가능 (수정 불가)**
- 상세 수정일: 2026-10-28 18:33:17
- 변수: 학생명, 수업일, 등원시각, 수업목록 총 4개
- 버튼: 수업 문의 / 웹링크
- 대체발송: **안함**

최초 목록에는 ‘검수진행중’이 남아 있었으나 로딩 완료된 상세 화면은 발송 가능으로 표시했다. 승인 상태는 이 관측 시점 기준이며, 운영 연결/발송 직전에는 API에서 다시 검사해야 한다. API 키로 조회한 결과는 아니다.

본문 첫 줄은 `[에스학원 반포 수업 일정 안내]`이다. 템플릿 **이름**은 ‘하루 수업 상세 안내’이므로, 본문 제목만 보고 기존 다른 템플릿을 선택하지 않는다. 상세에서 확인한 전체 본문을 `assets/alimtalk-contract.js`에 그대로 보존했고, 서버 모의 로직은 ID·채널·이름·승인·본문이 모두 맞아야 허용한다. 실제 버튼 링크와 활성/휴면 상태 등 API 전체 응답 검증은 운영 어댑터 연결 전에 추가 확인해야 한다.

공식 규격 근거:
- [템플릿 상세 GET](https://solapi.com/developers/api/templates-getTemplate): `/kakao/v2/templates/:templateId`, 승인 상태/본문/채널 확인.
- [그룹 중복 번호 옵션](https://solapi.github.io/solapi-nodejs/classes/index.SolapiMessageService.html): `allowDuplicates` 기본 false. 이번 설계는 학생·수신번호당 별도 그룹 1건으로 중복 번호 제약을 회피한다. 번호만으로 형제자매를 합치지 않는다.
- [웹훅 공식 검증](https://solapi.com/developers/api/webhook): 등록 secret의 SHA1을 `X-Solapi-Secret`과 상수시간 비교. 웹훅 등록 자체는 미실행.
- [메시지 상태와 길이](https://solapi.dev/guides/message-status-codes): 접수/처리/수신 완료 구분, 알림톡 한영 포함 1,000자 제한. 현재 길이는 보수적으로 JavaScript UTF-16 길이로 제한하며 내용은 절단하지 않는다.

## 3. 원본·학생 ID·연락처 조사

코드로 확인:

1. `Code.gs`의 `getDisplayValues()` 기반 시간표 파서(기준 소스 약 1410행 이후)는 Google Sheets의 강의실 헤더와 시간별 문자열을 `headers/grid/version`으로 반환한다. 이 API와 snapshot grid의 셀은 학생 ID를 포함하지 않는다.
2. `Index.html`의 `buildStudentImageMap()`은 학생 문자열의 첫 이름을 `studentImageScheduleMap` 키로 사용한다. 기존 카드 전체 구조를 ID 기반이라고 간주할 수 없다.
3. S-LMS `functions/exam-review/engine.js` 약 2073~2075행에는 학생 연락처와 `motherPhone`/`fatherPhone` 및 기존 별칭 필드 정규화가 있다. 학생 ID 기반 레코드는 존재하지만, **이 시간표 셀과 해당 학생 ID가 연결됐다는 근거는 없다.** 운영 학생/보호자 문서를 조회해 추정하지 않았다.
4. 라이브 시간표·S-LMS·데스크·계정 관리·인트라넷·강사 포털의 소스 검색에서 기존 SOLAPI 연동을 찾지 못했다. 사용자도 별도 저장소/연동이 확인되지 않았다고 답했다.

### 제안하는 최소 매핑

#### 2026-10-28 후속 확인: 인트라넷 학생 원장

사용자가 전달한 인트라넷 조사 결과를 바탕으로 로컬 소스를 재확인했다. 운영 문서·연락처는 조회하지 않았다. 앞선 ‘원본 셀에 학생 ID가 없다’는 판단은 유지하되, 라이브 시간표에 **후보 ID를 찾는 기존 함수는 존재한다**고 보완한다.

- `sedu-intranet/src/accounts/controller.js:658`의 `normalizeStudent()`는 문서 ID, `canonicalStudentId`, `studentIdAliases`, `mergedInto`, `isAlias`를 다룬다. `:802` 이후에는 `studentIdentityMappings`의 대표 ID·별칭을 적용한다. 클라이언트의 `chooseRepresentativeStudentId()`가 문자열 형식으로 고르는 fallback은 발송 확정 근거로 재사용하지 않는다.
- 같은 파일 `:1365` 이후 연락처 저장은 `studentContact/studentPhone`, `fatherContact/fatherPhone`, `motherContact/motherPhone`을 함께 기록한다. 수신 관계는 학생·부·모 필드로 구분한다. 서로 다른 비어 있지 않은 호환 필드가 충돌하면 조용히 하나를 선택하지 않고 보류한다.
- `sedu-intranet/functions/index.js:88`의 `actor()`는 토큰 회수 검증, ACTIVE, 반포관 업무 범위, deskPortal 접근을 확인한다. 이는 **알림톡 관리자 발송 권한 그 자체가 아니므로** 그대로 발송 허용으로 해석하지 않는다. `:116`의 `lookupStudent()`는 문서 ID로 조회하며 별칭 학생을 거부한다. 기존 함수의 응답을 연락처 API로 간주하지 않는다.
- 이번 작업 트리 `Index.html:3061`의 `getEnrollmentIdentityForStudent(name, school)`은 학교가 일치하지 않아도 이름 후보가 하나이면 반환할 수 있다. 출결용 기존 동작은 변경하지 않고, 알림톡의 검증된 매핑으로 사용하지 않는다. 학교 일치만으로 자동 확정하는 방법도 사용하지 않는다.

연동 기준은 `fir-lms-prod`의 **검증된 대표 학생 문서 `students/{studentId}`의 문서 ID**로 확정한다. 과거 ID는 명시적인 대표/병합/별칭 관계로만 해소하며, 대표가 여러 개이거나 연결이 순환·누락·충돌하면 보류한다. 대표 문서의 존재와 사용 가능 상태를 서버가 확인해야 한다. `studentIdentityMappings`는 과거 학생 ID를 대표 ID에 연결하는 자료로, 이름만 있는 시간표 원본과의 연결까지 입증하지 않는다.

최소 추가 범위는 아래와 같다. 아직 새 API·컬렉션·설정을 생성하지 않았다.

1. 원본 시간표 항목↔대표 문서 ID의 관리자 확인 매핑. 기존 학생 원장을 복제하거나 새 학생 ID 체계를 만들지 않는다.
2. 서버 학생 어댑터: 대표 ID와 명시적으로 선택한 관계(`student/father/mother`)로 원장 연락처를 읽는다. 브라우저가 보낸 번호는 발송에 사용하지 않는다. 미확인 `guardianOwner`는 선택 가능한 확정 수신자로 자동 승격하지 않는다.
3. 미리보기에는 관계와 마스킹 번호만 반환한다. 모·부·학생의 기본 수신자를 임의 지정하지 않으며 사용자가 선택한다. 저장형 우선 수신자 설정은 별도 스키마 승인 후 추가한다.
4. 발송 직전에 대표 ID·매핑 버전·학생 상태·선택 관계의 번호를 재확인한다. 대표 통합 또는 번호 변경 시 기존 미리보기를 무효화하고 재확인을 요구한다. ID 통합 전후의 발송 이력도 확인해야 하며, 단순히 중복키의 ID를 바꾸어 다시 보내지 않는다.
5. 추가 격리 시험: 별칭→대표 해소, 다중 대표/순환/누락, Contact/Phone 충돌, 미확인 보호자, 미리보기 뒤 대표 통합·번호 변경, 통합 전후 중복 이력. **이 후속 어댑터는 아직 구현·시험하지 않았으며 아래 18개 통과 결과에 포함하지 않는다.**

남은 연결 문제는 학생 ID의 저장 위치가 아니라 **원본 시간표와 대표 ID의 확정 매핑 및 최신 원본을 검증하는 서버 경로**다. 사용자 승인 전에는 기존 인트라넷·공용 서버를 변경하거나 운영 연결하지 않는다.

`timetableStudentMappings/{mappingId}` (제안이며 생성하지 않음):

- academyId, spreadsheetId, sheetId, 대상일, 안정적인 sourceStudentKey 또는 sourceCellRef
- studentId, sourceFingerprint, mappingRevision
- verifiedBy, verifiedAt, active

이름만으로 자동 생성하지 않는다. 학교·학년 등의 후보 정보를 보여주더라도 관리자가 원본 항목과 학생 ID를 확인해야 한다. 셀 위치만 사용할 경우 행 삽입/내용 변경 시 fingerprint 불일치로 매핑을 무효화한다. 일자별 모든 대상 셀이 빠짐없이 매핑됐다는 완전성 검사가 필요하다. 장기적으로 원본에 안정적인 학생 ID를 넣는 방법이 가장 명확하지만, 이는 별도 승인 범위다.

**서버 최신성 전제:** 기존 2시간 snapshot 또는 브라우저 `lastData`만으로 발송 직전 최신 시간표 확인을 대신할 수 없다. 기존 GAS의 서명된 읽기 전용 원본 경로를 분석해 직접 최신 원본을 읽는 어댑터를 마련하고, 셀 식별정보·매핑·완전성·대상일을 검증해야 한다. 여기서는 계약 `loadDay(actor,date,studentIds,signal)`과 합성 fixture만 구현했다. 새 GAS API/권한/서명 secret 등록은 하지 않았다.

## 4. 구현 파일 및 데이터 흐름

| 파일 | 변경 내용 |
|---|---|
| `assets/alimtalk-contract.js` | 실제 확인 본문·템플릿 식별자, 공통 제외 기준, 필수정보/시간 충돌/길이 보류, 정렬·연속 셀 병합·본문 치환 |
| `assets/alimtalk-ui.js`, `assets/alimtalk.css` | 수신자 직접 선택, 전체 본문, 보류·제외, 3종 건수, 확인창, 변경 전후, 상태/결과 조회, 늦은 UI 응답 차단 |
| `Index.html`, `docs/index.html` | 동일 모듈을 inline 포함(외부 경로에 의존하지 않음), 학생별/선택학생 미리보기·결과 버튼, 공통 이미지 제외 규칙 사용. 운영 transport는 연결하지 않고 ID 미연결 보류 |
| `snapshot-functions/alimtalk-contract.js` | 배포 패키지 자급성을 위한 공통 계약 복사, 테스트로 원본과 동일성 검증 |
| `snapshot-functions/alimtalk-service.js` | 주입형 모의 서버: 권한·학원·rate limit, 최신 재검사, 원자 선점, 결과 보존·조회, 공식 웹훅 secret 검사. 기존 함수 entrypoint에서 import/export하지 않음 |
| `snapshot-functions/alimtalk-store.js` | 제안 Admin SDK 저장 어댑터. 트랜잭션 claim/update/rate, 제한된 이력 조회. 실 DB에 연결하거나 실행하지 않음 |
| `scripts/alimtalk-fixture.cjs`, `scripts/alimtalk-test.cjs` | 합성 학생·번호·provider·저장소 및 테스트. 네트워크 fetch는 실패 처리 |
| `scripts/alimtalk-demo.cjs` | loopback 전용 모의 UI/API. 실제 HTTP SOLAPI transport 없음, 실제 credential/Firebase SDK 로드 없음 |

흐름: 관리자 인증 → 학원·발송권한 확인 → 대상일+학생 ID와 선택한 recipient ID → 최신 원본+검증 매핑+학생별 연락처 → 승인 템플릿 재확인 → 미리보기 저장 → 전체 본문/수신자 직접 확인 → 서버 최신 원본 및 권한 재검사 → 일정/수신자 변경 시 새 미리보기 요구 → 중복 키 원자 선점 → provider 1건 요청 → 결과 기록 → 웹훅/명시적 상태 조회.

중복 키: 학원 + 학생 ID + 대상일 + 정규화된 수신번호 + 안내종류 + 확정 일정 버전의 SHA256. 동일 학생의 동일 번호 관계 중복은 1건으로 처리하되 학생 ID가 다른 형제자매는 유지한다. 일정 버전에는 수업 정보/제외 결과/검증 매핑 버전이 포함된다. 미리보기 지문에는 전체 본문·수신자 등도 포함된다.

요청을 먼저 기록하고 provider를 호출한다. 타임아웃/프로세스 중단은 결과 확인 필요로 남기고 새 버전 재안내도 보류한다. provider 결과 조회에서 ‘없음’은 미발송 증거로 삼지 않는다. 실제 어댑터에서 customFields의 timetableKey로 조회·상관관계 복구가 가능한지 확인 전에는 불확실 요청 재발송 기능을 열지 않는다.

## 5. 필요한 서버 API·저장 구조·설정 (승인 전 제안)

새 서버 플랫폼보다는 기존 시간표 Functions 패키지의 별도 action을 검토한다. 이번 작업에서 action을 운영 endpoint에 연결하지 않았다.

| API | 입력 | 서버 처리 |
|---|---|---|
| preview | 한국 날짜, targets[{studentId,recipientIds}] | ID별 원본·연락처 검증, 마스킹 본문/보류 사유, 5분 previewId |
| send | previewId, confirmChanges | 생성 관리자와 학원 일치 확인, 최신 재검사, 변경 시 재확인, 원자 중복 선점 |
| results | 날짜, studentIds | 권한 내 이력 최대 200건, 초과를 오류로 표시 |
| reconcile | delivery ID | 서버에 저장한 messageId/groupId/key로 조회. 브라우저 번호·본문은 신뢰하지 않음 |
| webhook | 공식 헤더와 event 배열 | 검증 후 저장 성공 시에만 응답. 중복·역순으로 최종 상태를 되돌리지 않음 |

제안 컬렉션:
- `timetableAlimtalkPreviews`: actor/academy, 대상·선택수신자, 일정·본문 지문, 만료시각. 개인정보 포함 서버 전용이며 보존기한/TTL 설정은 승인 필요.
- `timetableAlimtalkDeliveries`: 중복키 문서 ID, 학생·날짜·수신자·관계·본문·일정 버전, actor/createdAt, state, messageId/groupId/errorCode. 기존 수동 전달 문서에는 쓰지 않음.
- `timetableAlimtalkLimits`: 사용자 및 학원별 분당 제한. 모의 기본값 preview/results 30, send/reconcile 10, 학원 send 30. 최대 요청 학생20·선택 수신자10. 실제 사용량과 SOLAPI 한도를 확인해 확정 필요.
- `timetableStudentMappings`: 위의 관리자가 검증한 원본↔ID 매핑.

연결 전 필요한 설정/승인:
1. 관리자·학원 범위를 현재 계정 데이터로 검증하는 어댑터. 현재 예시의 `canSendTimetable`은 제안 계약이며 운영에 존재하는 필드로 단정하지 않음. 사용자 역할만 보고 학원 권한을 부여하지 않음.
2. ID 매핑 및 최신 원본 읽기 어댑터 확정. 보호자 관계/번호 필드의 권위 있는 원본, 병합·퇴원 학생 처리 확정.
3. 기존 키 유무를 관리자 확인 후 서버 Secret Manager 참조 설정. 키를 프런트·Git·브라우저 저장소에 넣지 않음. **키 발급/등록 미실행.**
4. SOLAPI live provider 어댑터(GET template, 1-message group send, status lookup), 실제 응답 계약 확인. 현재 provider는 mock이며 실제 전송 HTTP 구현은 아직 연결하지 않음.
5. 웹훅 URL/secret 등록, 실패 코드 전체 매핑, 5초 이내 영속 저장 응답 검증. 실 웹훅 테스트 미실행.
6. 서버 전용 컬렉션 클라이언트 접근 거부 검증, history 복합 인덱스 필요 여부, 보존/삭제 정책 검토. 운영 규칙/인덱스 변경 미실행.

추가 비용: preview/중복 선점/결과 저장/요청 제한의 Firestore 읽기·쓰기가 추가된다. 자동 전체 학생 조회나 무한 결과 폴링은 사용하지 않는다. 메시지 실제 발송 비용과 별개다.

## 6. 모의 테스트 결과 및 한계

`node --test scripts/alimtalk-test.cjs`: **18/18 통과**.

- 하루 1개/여러 수업, 정렬·등원 시각
- 연속 동일 셀 병합 / 과목·강사·관·강의실·유형 변경 시 분리
- 동명이인 ID 분리, 미확인/중복 매핑 보류
- 같은 보호자 번호 형제자매: 학생2/메시지2/번호1
- 결석예고·당일취소·휴강·모의 공강 제외, 모든 취소 보류
- 필수정보·날짜·시각·충돌·1,000자 초과 보류(절단 없음)
- 수신자 자동선택 없음, 다른 학생 수신자 ID 보류
- 미리보기 이후 시간표/번호 변경 시 전송0
- 중복 클릭·다른 관리자 경쟁·서비스 재생성 후 전송1
- never-settling provider timeout 후 UNKNOWN, 재발송 차단
- 일정 변경 재안내 전후 내용·명시 확인
- 부분 실패 학생별 상태 분리
- 공식 secret 검증, 중복·역순 웹훅
- 관리자/학원/비활성 권한, template 불일치, partial source, rate/expiry
- HTML/서버 공통 소스 일치

기존 회귀: `card-note-preview-test.cjs`, `card-reliability-checks.cjs`, `firebase-card-checks.cjs` 통과. JS syntax 및 `git diff --check` 통과.

실제 Chrome에서 **로컬 합성 workbench**로 수신자 선택→전체 미리보기→건수 확인→모의 접수→명시 조회 후 수신 완료 흐름 확인. 모바일390px 줄바꿈/버튼 표시 확인, 관측 콘솔 error/warn0. 캡처는 `evidence/alimtalk-20261028/`에 있다. 이는 운영 전체 카드 modal의 E2E나 실제 SOLAPI 발송 검증을 대신하지 않는다. 신규 Firestore 어댑터의 실 에뮬레이터 검증, 권한 어댑터, 실제 원본 매핑, live provider 계약 시험은 운영 연결 승인 단계의 남은 작업이다.

## 7. 배포·롤백 계획

이번에는 배포하지 않는다. 새 원본/API/설정 범위 검토 후 별도 승인 필요.

승인 후: 운영 대응 소스 재확인 → 위 미완료 어댑터 구현 → demo 프로젝트/목으로 전체 회귀 및 Firestore 동시성·권한·웹훅 응답 검증 → 명시 허용된 기능만 배포 → 서버 발송 기능은 차단 상태에서 읽기 전용 template/preview 확인 → 실제 발송은 별도 승인 후 대상·번호·내용·건수 확인.

release 파일에는 mock fixture/token/실험 transport를 포함하지 않는다. 기존 Pages는 `docs/index.html`, 기존 Functions 패키지만 사용하며 GAS·공용 서버·다른 앱을 일괄 배포하지 않는다. 현재 모듈은 기존 entrypoint에 연결되지 않아 실수로 서버 모듈만 포함되더라도 발송 endpoint가 생기지 않는다.

롤백: 우선 서버 발송 경로 차단 후 자신의 배포 ID인지 확인, 이전 검증된 프런트/서버 아티팩트만 복구. 발송 이력·중복키·불확실 상태는 **삭제하거나 초기화하지 않는다**. 이미 접수한 메시지는 배포 롤백으로 취소되지 않는다. 이후 배포가 있으면 전체 롤백을 멈추고 복구 범위를 확인한다.

## 8. 2026-10-28 후속 구현: 학생 원장·최신 원본 어댑터

이 절은 3절의 ‘후속 어댑터 미구현’ 상태를 갱신한다. 로컬 모듈을 구현했으며 운영 연결은 하지 않았다. 기준 HEAD는 계속 `064b0d4821c40f8fdb1ca9970c3b1734da0bb94a`이고 이번 파일들은 아직 미커밋이다.

### 수정 파일과 동작

- `snapshot-functions/alimtalk-students.js`: 주입형 서버 학생 어댑터. 문서 ID 직접 조회와 제한된 별칭 매핑 쿼리만 수행한다. 대표 ID 충돌·순환·누락·비활성·상태 미확인은 차단한다. 이름이나 클라이언트의 대표 ID 추정 함수는 사용하지 않는다. 호환 연락처 필드의 값이 다르면 해당 관계를 보류하고 `guardianPhone`은 자동 수신자로 사용하지 않는다.
- 같은 모듈의 `withStudentDirectory()`: 신뢰된 원본 매핑 결과에 서버 학생 정보를 결합한다. 원본/브라우저가 제공한 연락처는 덮어쓴다. 과거 ID가 다른 대표 ID로 바뀌면 `CANONICAL_RECONFIRM_REQUIRED`로 보류한다. 병합 전후 이력 조정 없이 새로운 ID로 발송을 허용하지 않는다.
- `snapshot-functions/alimtalk-service.js`: 원장 검증 실패를 미리보기 보류 사유로 반영한다. 선택 수신자는 계속 명시적으로 지정해야 한다. 권한은 최초 요청의 관리자 전용 범위를 유지한다. 실무자 미리보기 권한 확대는 이번 변경에 포함하지 않는다.
- `snapshot-functions/alimtalk-source.js`: 기존 GAS `snapshot_export` 서명 계약을 사용하는 읽기 전용 어댑터. 기본 네트워크 transport·자격증명은 없으며 주입하지 않으면 실행되지 않는다. 명시한 시트/한국 날짜, 결과 1개, 스키마, 요청 시작 이후의 capturedAt을 확인한다. 실패·중복 결과·이전 snapshot은 정상 데이터로 취급하지 않는다. 8초 이하 deadline과 취소 정리를 적용한다. snapshot DB 저장·sync 함수·예약 작업을 호출하지 않는다.
- `scripts/alimtalk-students-test.cjs`, `scripts/alimtalk-source-test.cjs`: 신규 합성 테스트. `global.fetch` 차단, Firebase SDK 및 실제 자격증명 미사용.

### 기존 서버 경로 확인

`Code.gs:30`의 `doPost()`는 기존 `TIMETABLE_SNAPSHOT_SECRET`으로 HMAC을 검증하고 `exportScheduleSnapshots_()`를 호출한다. `:67`의 export는 지정한 시트를 `getFixedGridData(sheet,true)`로 새로 읽는다. 별도 GAS action을 새로 만들 필요는 없어 보이지만, 운영 배포 버전이 이 소스와 일치하는지는 이번에 검증하지 않았다.

`snapshot-functions/index.js:33` 이후 기존 동기화는 원본 응답을 받은 뒤 snapshot과 catalog를 저장한다. 따라서 그 동기화 함수를 발송 직전 확인용으로 재실행하지 않는다. 새 읽기 어댑터에는 DB 저장 호출이 없다. 원본 호출 1회가 시트·목록 읽기 비용을 발생시킬 수 있다는 점은 별개이며, 비용 절감으로 주장하지 않는다.

### 검증 결과

`node --test scripts/alimtalk-test.cjs scripts/alimtalk-students-test.cjs scripts/alimtalk-source-test.cjs`: **34/34 통과**. 증거: `evidence/alimtalk-20261028/identity-tests.txt`.

기존 18개에 추가한 16개는 대표 문서 ID, 명시 별칭, 누락된 과거 문서의 매핑, 충돌·순환·비활성, 연락처 관계와 충돌, 기본 수신자 미선택, 번호 변경, ID 병합 후 보류, 원본 매핑 불명확, 취소, 쿼리 상한, GAS 서명 요청, 오래되거나 다른 대상일 응답, never-settling transport, 설정 누락을 확인한다. 기존 카드 검사 3개도 다시 통과했다.

이는 실제 Firestore/실제 GAS/실제 SOLAPI 계약 통합 검증이 아니다. 운영 조회·발송·배포·키 열람이나 등록을 수행하지 않았다. 이번 변경은 서버 모듈이므로 기존 UI 캡처를 새 어댑터의 운영 연결 증거로 사용하지 않는다.

### 운영 연결 전 남은 구체적 작업과 변경 범위

1. **관리자 확정 매핑 작성 경로**: 현재 시간표의 문자열 셀을 서버에서 파싱해 안정적인 원본 참조·fingerprint를 만들고, 관리자가 선택한 대표 문서 ID와 연결하는 API/UI가 필요하다. 원본 전체의 해당 학생 수업 누락 여부 검증도 필요하다. 현재 `loadMappedDay`는 이 조건을 요구하는 주입 계약이며 실제 파서/저장 API가 아니다.
2. **기존 Functions 패키지의 신규 엔드포인트**: preview/send/results/reconcile/webhook과 매핑 확인·저장. 새 서버 플랫폼은 제안하지 않는다. 기존 snapshot endpoint의 권한을 자동 발송 권한으로 확장하지 않고 ACTIVE 관리자·반포관 범위를 서버에서 검증해야 한다.
3. **신규 저장 컬렉션**: 앞서 제안한 timetableStudentMappings, timetableAlimtalkPreviews, timetableAlimtalkDeliveries, timetableAlimtalkLimits. 기존 학생 원장·수동 전달 상태를 복제하거나 덮어쓰지 않는다. 접근 규칙·보존 기간·필요 인덱스는 배포 범위 검토 시 확정한다. 이번에는 만들거나 변경하지 않았다.
4. **ID 병합 후 재개 경로**: 현재는 확실히 차단한다. 재개를 위해서는 이전 ID들의 발송 이력을 조회하고, 결과 불명확 요청 및 중복 여부를 확인한 뒤 확정 매핑을 갱신해야 한다. 이 절차 구현 전에는 병합된 대상 발송을 허용하지 않는다.
5. **운영 설정**: 고정 GAS URL과 기존 snapshot secret 접근 권한, SOLAPI 서버 secret, 웹훅 URL·검증 secret, 발송 기능 차단 설정. 기존 키/권한의 가용성은 확인하지 않았으며 없는 것으로 단정하지 않는다. 비밀값은 보고서·채팅·브라우저에 넣지 않는다. 실 SOLAPI transport와 공식 응답/웹훅 schema 확인은 별도 연결 단계다.

사용자의 ‘새 서버 구축이나 운영 배포 전 변경 범위·설정 보고, 실제 발송·키 등록 금지’ 경계를 유지한다. 위 모듈은 현재 배포 entrypoint에서 참조되지 않는다. **전체 연동 완료 또는 운영 배포 가능 상태로 판정하지 않는다.** 승인된 연결 범위가 확정되면 원본 매핑·권한·스토어 에뮬레이터·실 transport 계약을 격리 검증하고, 기존 34개 및 카드 회귀를 함께 재실행한다. 배포·롤백은 7절을 따른다.

## 9. 인트라넷 피드백 및 사용자 확정 정책 반영

2026-10-28 전달된 인트라넷 조사 문서를 참고하고 `sedu-intranet/functions/accountAccess.js`의 활성 계정 조건을 재확인했다. 운영 학생·연락처는 조회하지 않았다.

### 사용자가 확정한 정책

- 학생 상태 `ACTIVE`, `RETURNED` 허용. 그 외 상태는 보류.
- 기존 문의 연락 금지를 대표 학생 ID로 확실히 연결할 수 없으면, **관리자가 연락 가능 여부를 확인·기록한 대상만 허용**.
- 수신자는 계속 학생·부·모 중 직접 선택. 자동 기본 수신자는 만들지 않는다.

### 구현

- `snapshot-functions/alimtalk-auth.js` 추가: 토큰 회수 여부 포함 검증, 매 요청 서버 계정 조회, 활성 ADMIN, 반포관 scope, deskPortal 접근을 모두 확인한다. liveTimetable의 명시적 접근 회수도 거부한다. Origin에 따라 범위 검사를 생략하지 않는다. canManageAccounts를 받은 STAFF를 ADMIN으로 간주하지 않는다. 기존 계정관리·인트라넷 서버는 변경하지 않는다.
- `alimtalk-students.js`: isDeleted/deletedAt/disabled 차단 추가. 기존 ACTIVE/RETURNED 허용은 사용자 결정대로 유지했다. 삭제·별칭·비활성 예외를 상태 허용으로 덮어쓰지 않는다.
- `withStudentDirectory()`에 서버 `readClearance` 계약 추가. 확인 기록이 없으면 보류한다. 반포관·대표 ID·대상일·원본 매핑 버전·학생 identity 버전·확인자·확인 시각을 검증하고, 선택 관계의 허용 여부와 번호 hash가 일치해야 한다. 번호는 계속 원장에서만 얻는다. 관리자의 반포관 업무 권한만으로 해당 학생의 관 소속을 추정하지 않으며, 별도로 campusConfirmed 기록을 요구한다.
- 확인 기록의 revision을 일정 확인 버전에 포함한다. 미리보기 후 허용 철회·번호 변경·매핑 변경 시 서버 재검증에서 재확인을 요구하고 보내지 않는다.

### 최소 확인 기록 제안 — 아직 저장 API/컬렉션 생성 안 함

```text
academyId, studentId(대표 문서 ID), date(KST), mappingRevision,
identityRevision, revision, checkedBy(서버 인증 UID), checkedAt(서버 시각),
campusConfirmed,
recipients: { student|father|mother: { allowed, phoneHash } }
```

이 기록은 문의 ID의 연락 금지 기록을 삭제하거나 해제하지 않는다. 관리자는 원본 문의의 제한 여부와 현재 연락 가능 여부를 실제로 확인해야 한다. 학생별·관계별 기록이며 번호나 매핑을 바꾸면 이전 기록을 재사용하지 않는다. 현재는 대상일에 한정한다. 향후 확인 기록 저장 API는 인증된 관리자 UID/시각/hash/버전을 서버에서 채우고, 브라우저가 보낸 확인자·번호·hash를 신뢰하지 않아야 한다. 단순 번호 hash를 익명화로 간주하지 않으며 서버 접근 제한이 필요하다.

### 검증

전체 합성 테스트 **40/40 통과**. 위임 STAFF 거부, 비활성·퇴사/휴직·scope/app 회수, 토큰 오류, 삭제 학생, RETURNED 허용, 확인 기록 누락, 다른 관/학생/날짜/버전, 관계별 허용 철회·번호 불일치 및 미리보기 이후 변경을 포함한다. 기존 카드 회귀 검사 3개 재통과, `git diff --check` 통과. 증거는 기존 evidence 경로를 갱신했다.

### 남은 범위 및 사용자 정보

이번 정책에 대한 추가 답변은 현재 필요하지 않다. 구현을 위해 운영 학생 개인정보를 받을 필요도 없다. 남은 항목은 8절의 서버 원본 파서·관리자 매핑/연락 확인 UI와 저장 API·실 Firestore 및 SOLAPI transport 통합·격리 통합 검증이다. 이번 확인 기록/권한 모듈은 주입형 로컬 구현으로, 실제 엔드포인트나 운영 발송 경로에 연결되지 않았다. **운영 배포·실제 발송·키 등록은 미실행**이다. 운영 연결 시 기존 서버 secret 가용성과 배포 권한을 확인하고, 신규 설정이 필요하면 해당 단계에서만 별도 승인을 받는다.

## 10. 네 단계 승인 후 구현 진행 (2026-10-28)

사용자가 구현·화면 검토·운영 연결·제한 발송 검증의 네 단계를 승인했다. 후속 답변으로 **SOLAPI 키는 아직 미등록**, **실제 검증은 관리자 본인 번호를 추후 지정**하는 것으로 확인했다. 따라서 기존 ‘배포 승인 대기’는 더 이상 일반적인 차단 사유가 아니다. 현재 차단 사유는 구현/운영 통합 검증 미완료이며, 실제 SOLAPI 연결에는 키 설정이, 실제 발송에는 지정된 대상 번호가 추가로 필요하다. 번호/키 값은 채팅으로 받지 않는다.

### 추가 구현 파일

- `snapshot-functions/alimtalk-review.js`: 원본 항목 조회, 최대20명 후보 검색, 명시적 학생 매핑 저장, 마스킹 수신자 조회, 연락 확인 기록 저장 API 도메인 로직. 저장 직전 권한 재검증. 원본 revision·대표 ID·연락처 version 변경 시 차단. 확인자·시각·번호 hash는 서버에서 생성.
- `snapshot-functions/alimtalk-review-store.js`: 매핑·일자별 항목 소유권·연락 확인·감사 이력의 Firestore transaction 어댑터. 다른 학생에게 이미 연결된 항목과 이전 revision의 덮어쓰기를 차단. 감사 이력은 별도 생성하며 기존 내용을 지우지 않는다. 문서 크기 상한을 적용.
- `assets/alimtalk-review-ui.js`: 명시적 원본/학생 선택 → 반포관·수신 관계·연락 가능 근거 확인 → 저장 흐름. 수신자 자동 선택 없음. PC 및390px 모바일에서 합성 서버로 클릭·저장을 확인.
- `snapshot-functions/alimtalk-grid.js`: 실제 snapshot의 문자열 구조를 보수적으로 파싱. 교사/과목/유형/관/강의실을 알 수 없으면 추정하지 않으며, 미지원 문자열은 보류. 원본 항목 fingerprint와 관리자 매핑을 대조해 `loadMappedDay` 데이터를 구성.
- `snapshot-functions/alimtalk-http.js`: 허용 Origin·JSON·요청 크기·명시 action 검사를 갖춘 주입형 HTTP 핸들러. 기본 send는 차단. 변경 요청의 HTTP timeout은 완료 실패로 단정하지 않고 RESULT_UNCERTAIN으로 처리한다. 실제 배포 export와 키/transport는 아직 연결하지 않았다.
- `scripts/alimtalk-review-demo.cjs`: localhost:8788의 합성 화면 서버. 메모리 저장만 수행하며 운영 SDK/네트워크 호출 없음.

### 검증 결과

합성 자동검사 **56개 통과**: 기존 검사와 함께 저장 경쟁, 기존 연결 덮어쓰기 거부, 번호 변경 후 확인 거부, 원본 파싱/매핑, 원본 변경 차단, 전체 하루 수업 병합→모의 발송 통합 흐름, HTTP 인증 전달/Origin/요청 형식/timeout을 확인했다. Firestore transaction은 메모리 모형으로 검사했으며 실제 에뮬레이터 시험으로 표현하지 않는다.

Chrome에서 동명이인 후보 2명 표시 → 학생 직접 선택 → 연결 저장 → 마스킹 수신자 직접 선택 → 확인 근거 입력 → 저장 완료를 확인했다. 390px 모바일에서 가로 넘침 없이 표시됨을 시각 확인했으며 관측 콘솔 error/warn0. 저장은 합성 메모리뿐이다.

캡처:
- `evidence/alimtalk-20261028/review-mobile.jpg`
- `evidence/alimtalk-20261028/review-saved-mobile.jpg`

### 운영 전에 해결할 사항 — 배포 가능 판정 아님

1. 보수적 파서는 현재 이름+학교학년이 명확한 표준 문자열만 처리한다. 학생 정보가 없는 보조행/다른 문법/교사 누락을 조용히 버리지 않는다. 실제 문법 회귀 fixture 확장과 이미지 카드의 문법·제외 기준 동등성 확인이 필요하다.
2. 현재 완전성 정책은 원본의 모든 명명된 학생 항목의 매핑을 요구한다. 일부 항목만 연결한 채 ‘해당 학생 하루 전체’라고 오인하는 것을 막지만 초기 확인량이 크다. 이 정책을 완화하려면 원본에 영구 ID를 부여하거나 완전성을 증명할 별도 기준이 필요하다.
3. 확인 UI는 격리 workbench에 연결했다. 기존 카드 modal의 운영 API URL/인증/확정 ID 선택과의 결합, 저장 timeout 뒤 기록 조회·복구 UI는 남았다. 현재 공개 Pages UI가 실제 연결됐다고 주장하지 않는다.
4. Functions 배포 설정은 기존 `firebase.snapshots.json`의 `live-timetable-snapshots` codebase를 확인했다. `scripts/deploy.sh`는 GAS push/deploy이므로 프런트/새 Functions의 단독 배포 경로로 실행하지 않았다. `gh` 실행파일은 없었으며 Pages API 조회는 실행되지 않았다. 배포 버전·복구 아티팩트·현행 권한/규칙·신규 컬렉션 접근 차단을 확인하기 전 배포하지 않는다.
5. SOLAPI 실제 transport/승인 template 재확인/웹훅 계약과 서버 secret 연결, demo Firebase 에뮬레이터 전체 회귀가 남았다. 키 미등록을 이유로 위 독립 구현을 생략한 것이 아니며, 이 보고서는 현재까지의 완료와 남은 작업을 구분한 중간 기록이다.

운영 배포 ID 없음. 실제 발송 0. 운영 학생·연락처 조회/수정 0. 키 발급/등록 0. 다음 사용자 제공 항목은 서버 secret 등록 완료 여부(비밀값 제외)와 이후 별도 화면에서 입력할 관리자 테스트 번호다.

## 11. Secret 등록 및 실제 인증 확인 (2026-10-28 20:07 KST)

사용자가 두 항목 등록 완료를 알렸다. `fir-lms-prod` Secret Manager 메타데이터에서 `TIMETABLE_SOLAPI_API_KEY`, `TIMETABLE_SOLAPI_API_SECRET` 모두 버전1 enabled를 확인했다. gcloud 기본 Python3.9 호환 오류는 명령별 CLOUDSDK_PYTHON에 기존 Codex 번들 Python 경로를 지정하여 해결했다. 전역 설정을 바꾸지 않았다.

`scripts/alimtalk-template-preflight.cjs`를 추가하고 직접 실행했다. 값은 subprocess 출력에서 프로세스 메모리로만 받아 HMAC 서명에 사용했으며 파일/로그/채팅에는 기록하지 않았다. 이 스크립트는 지정 templateId의 GET만 구현하고 send API는 없다.

지정 템플릿 실제 API 조회 결과: 인증 성공, APPROVED, 이름·channelId·본문 일치, 변수4개, 버튼1개. 반환 변수명은 `#{학생명}`, `#{수업일}`, `#{등원시각}`, `#{수업목록}`였다. 최초 검사에서는 중괄호 없는 기대 문자열과 비교하여 variablesMatch:false였으나 반환값을 확인해 비교기의 기대 표기를 실제 API와 동일하게 수정했다. 템플릿 자체의 변수 불일치가 아니며 템플릿은 수정하지 않았다. 문제 확인을 위해 동일 템플릿 GET을 총2회 사용했다. dormant 필드는 확인한 상위 응답에 없으므로 비휴면이라고 확정하지 않는다.

실제 발송0, 학생/보호자 조회0, 배포0. 테스트 수신번호는 여전히 미지정이다. Secret 저장 완료는 Functions에 secret을 바인딩하거나 발송 endpoint를 배포했다는 뜻이 아니다. 운영 연결과 제한 발송 검증의 기존 승인은 유지하며, 다음 작업은 실제 provider/기존 카드 UI 연결 및 남은 통합·권한 검증이다.

## 12. 서버·카드 연결 및 제공된 규칙 검증 (2026-10-28)

`alimtalk-runtime.js`와 `timetableAlimtalkApi` export를 연결했다. 기존 source HMAC 읽기, 서버 인증, 대표 ID/확인 기록, Firestore 저장 어댑터, 지정 템플릿 GET을 조립한다. 카드 화면에는 학생 연결·연락 확인과 인증된 API 요청을 연결했고, 저장 revision을 다시 조회해 충돌을 방지한다. 실제 send/lookup transport는 아직 잠겨 있으며 서버 allowSend:false, 프런트 sendEnabled:false로 실제 발송을 차단한다. 현재 단계는 실제 발송까지 완료한 연동이 아니다.

합성 자동검사 59/59 통과(기존 기록 identity-tests.txt). 기존 서버 30개 및 카드 검사 3개의 기록을 유지한다. 분 단위/부분 시간 문법은 잘못된 정시 수업으로 보내지 않고 PARTIAL_TIME_REVIEW_REQUIRED로 보류한다. 최신 카드 화면 통합의 브라우저 전체 회귀, 실제 Firestore 어댑터의 저장 경쟁 시험, 배포 산출물/복구본 확인은 별도로 남아 있다.

### 사용자 제공 Firestore 규칙

- 근거: 사용자가 콘솔에서 복사해 첨부한 `fc6a4370-2c46-4598-bfa5-9523c255d094/붙여넣은 텍스트.txt`.
- SHA-256: `c7530a57d2082dce21604bced12fa26f89e2204bccc1d9a96fd33a2c58a16b8a`.
- 전체 match 경로를 검토했다. 신규 7개 컬렉션에 해당하는 allow 규칙이 없고 826–827행의 재귀 wildcard가 read/write:false다. 다른 경로의 허용 규칙과 겹치지 않는다.
- 대상: timetableStudentMappings, timetableStudentMappingDays, timetableAlimtalkClearances, timetableAlimtalkReviewHistory, timetableAlimtalkDeliveries, timetableAlimtalkPreviews, timetableAlimtalkLimits.
- 기존 로컬 Firestore emulator v1.19.8, localhost:18829, 프로젝트 demo-timetable-alimtalk, single_project_mode_error:true에 첨부 파일을 직접 적용했다. 운영 credentials/운영 API 없이 REST 테스트 실행.
- 비로그인·ADMIN·INSTRUCTOR·STAFF 합성 JWT ×7컬렉션×get/list/write/delete **112건 모두403**. 토큰이 단순 무효여서 차단된 결과가 아닌지 확인하기 위해 각 인증 역할의 자신의 intranetStaffScopes 경로 읽기가404(허용된 누락 문서 조회)인 양성 대조3건도 통과했다.
- 재현 코드: scripts/alimtalk-rules-test.cjs. 결과: evidence/alimtalk-20261028/rules-tests.txt.
- 범위: 제공된 규칙에 대한 실제 로컬 규칙 엔진 검증이다. 운영 release/ruleset ID를 API로 독립 조회한 결과는 아니며, 기존 API403은 그대로다. 운영 규칙 수정·게시0, 운영 문서 조회/쓰기0. Admin SDK는 이 규칙을 우회하므로 서버 권한 검사 통과까지 대신 입증하지 않는다.

신규 경로 접근 차단에 대한 제공 규칙 검증은 통과했다. 나머지 전체 통합/배포 검증이 완료되지 않았으므로 아직 배포하지 않았다. 실제 발송0, 배포 ID 없음. 테스트 수신자 지정 전 실제 발송 차단은 유지한다.

## 13. 최종 통합·격리 회귀 및 배포 준비 (2026-10-28)

### 수정 및 검증

- 실제 카드 HTML의 인증 요청 → 원본/대표 학생 선택 → 확인 기록 저장 → 수신자 직접 선택 → 치환 본문 및 학생/메시지/번호 건수 → 발송 차단을 PC1440×1000, 모바일390×844 Chrome에서 합성 API로 확인했다. 운영 통신은 CSP(connect-src self, frame/worker 차단)와 명시 mock 외 요청 거부로 차단했다. 기존 카드 상태 저장은 이 화면 시험에서는 stub으로 비활성화하며 별도 기존 회귀 검사 결과와 구분한다.
- 늦은 응답/무한대기: UI 요청 deadline10초, 요청 종료 후 세대 폐기, 모드 전환 세대 및 동일 계정 재로그인 세대 검사 추가. JSON body 읽기 이후에도 세대를 다시 검사한다. 실패 시 연결 기록 재확인 버튼을 제공한다.
- 서버에서 후보·원본·연락처·확인 기록·미리보기·결과 응답 직전 권한을 재검증한다. 외부 권한 회수를 즉시 감지한다고 주장하지 않으며 요청 중 재검증 경계를 보강했다.
- Node22 런타임 **64/64** 합성 회귀 통과. 기존 서버30/30, 카드 검사3종 통과. 실제 Firestore demo 에뮬레이터 저장 테스트3/3(교차 학생 동시 매핑/CAS 및 감사 보존, persistent 중복 claim, atomic rate limit) 통과. 별도로 보안규칙112건 및 인증 양성 대조3건 통과. 합성 테스트와 실제 청구/운영 결과를 혼동하지 않는다.
- 에뮬레이터는 demo-timetable-alimtalk,127.0.0.1:18829로 고정하고 운영 credentials 환경변수를 제거한다. DB 데이터는 합성뿐이며 신규 운영 컬렉션을 시험 목적으로 만들지 않았다.
- 브라우저 증거: evidence/alimtalk-20261028/card-integrated-pc.png, card-integrated-mobile.png. 최종 모바일 측정: dashboard/workarea scrollWidth=clientWidth=349, sidebar317, 알림톡 panel315. 가로 넘침0.

| Before | After |
|---|---|
| 알림톡 패널의 필드셋·텍스트 입력이 좁은 영역에서 넘칠 수 있음 | assets/alimtalk.css: border-box, min-inline-size:0, 입력 폭100%·높이44px 적용 |
| PC 알림톡 본문이 기존220px 사이드바에 표시됨 | 패널이 열린 경우320px, 작은 화면에서는100% 폭 |
| 미발송 사유 textarea가 모바일에서22px 넘침 | #cardUnsentReason border-box 및 max-width100% |
| 패널 내용 생성 전에 스크롤하여 안내 위치를 놓침 | 비동기 내용 생성 후 패널 시작 위치로 이동 |
| 조회가 끝나지 않거나 이전 응답이 늦게 도착함 | deadline 및 요청/로그인 세대 검사로 해제·폐기, 명시 재확인 제공 |

### 배포 범위 및 복구 준비

운영 https://sedubanpo.github.io/timetable/ 정적 HTML이 기준커밋064b0d4821c40f8fdb1ca9970c3b1734da0bb94a의 docs/index.html과 바이트 동일하다. SHA256 f88c5cb9dad986f5518df2364a2ee3c2eaa35b66c0df29139b70440b6b334db4. 직전 Pages workflow40649761503 성공. 복구 HTML은 evidence/alimtalk-20261028/predeploy-index.html에 보존하고 전체 복구 소스는 해당 Git commit이다.

신규 timetableAlimtalkApi만 기존 live-timetable-snapshots codebase로 선택 배포하고, 기존 snapshot 함수/예약작업 및 다른 codebase는 제외한다. Pages는 기존 main/docs 경로를 유지한다. 배포 직전 main 재확인 결과 기준커밋 동일, 진행 중 Pages run0 및 로컬 배포 명령0 확인. 로컬 배포 잠금 /tmp/live-timetable-alimtalk-deploy.lock은 원격 운영자의 활동을 완벽히 통제하는 전역 잠금이라고 주장하지 않는다.

이번 공개 범위는 관리자 학생 연결·연락 확인·미리보기·이력 조회이며 **send/provider는 계속 서버 차단**한다. SOLAPI 발송/결과 조회 transport 및 webhook의 운영 활성화는 테스트 수신자 지정 후 별도 제한 발송 검증 단계에 포함된다. 실제 학생에게 전송 가능한 완성 발송 기능이라고 표현하지 않는다.

원본 문법/ID 확인이 불완전하면 보류하며 현재는 하루 원본 전체 항목의 확정 매핑이 필요하다. 이 초기 확인량과 부분시간 문법 보류는 남은 제품 제약이다. 운영에 잘못된 시간·누락된 수업을 전달하기 위해 이를 완화하지 않는다.

복구: 배포 후 문제 시 현재 Pages commit이 이번 배포인지 확인한 뒤 이번 프런트 변경을 revert하여 기존 docs 산출물로 복구한다. 새 API는 기존 API를 교체하지 않으므로 프런트 복구 후 호출되지 않는다. 필요하면 새 API의 차단 응답 버전을 재배포하며, 저장된 감사/확인/업무 원본은 삭제하지 않는다. 후속 다른 배포가 있으면 전체 롤백을 중지하고 충돌 범위를 먼저 확인한다.

### 배포 실행 및 서버 확인

- 신규 API 배포 완료: timetableAlimtalkApi, asia-northeast3, Node22, revision `timetablealimtalkapi-00001-vis`, build `96abc390-7957-4055-8f2b-04c12e19c8e7`, 2026-10-28 20:42:53 KST. 대응 서버 소스816b7ce. 기존 snapshot 함수와 예약 함수는 배포 대상에서 제외했다.
- Firebase CLI가 기존 실행 서비스계정에 두 SOLAPI secret의 secretAccessor를 부여하고 새 함수에 바인딩했다. 키 값은 보고서/프런트에 넣지 않았다. Firestore 규칙·인덱스는 변경하지 않았다.
- 운영 API 최소 확인4건: 허용 Origin OPTIONS204, GET405, 토큰 없는 preview403, 다른 Origin403. 모두 업무 데이터 조회 전에 종료되는 경로다. 실제 관리자 학생 조회/저장, 실제 SOLAPI 발송 검증은 수행하지 않았다.
- Node22 실제 Firestore 에뮬레이터3/3도 재통과했다.
- 최종 화면 검사에서 학생별 미리보기 버튼이 이름을 압축하는 문제를 추가 수정했다. 목록은 이름/설명 아래 상태·버튼을 배치하며 버튼 최소44px. 수정 후 합성64·기존 서버30·카드3종 전체 재통과. 최신 목록 증거 card-final-pc.png 및 card-final-mobile.png.

| Before | After |
|---|---|
| 학생별 미리보기 버튼 추가로 좁은 PC 목록에서 학생명이 한 글자씩 줄바꿈됨 | 목록을 이름·설명과 상태·버튼의 두 줄로 배치하고 버튼44px 보장 |

## 14. 이번 배포 결과 (2026-10-28)

- **학생 연결·연락 확인·미리보기 단계 배포 완료. 실제 발송 운영 활성화는 미완료이며 차단 상태.**
- 운영 화면: https://sedubanpo.github.io/timetable/
- Pages commit: `04021a8a565738019545dc1c5779b78600e34166`; workflow `40682313930` success. https://github.com/sedubanpo/timetable/actions/runs/40682313930
- API: https://asia-northeast3-fir-lms-prod.cloudfunctions.net/timetableAlimtalkApi ; revision `timetablealimtalkapi-00001-vis`, build `96abc390-7957-4055-8f2b-04c12e19c8e7`, 서버 대응 commit `816b7ce` (04021a8에는 서버 변경 없음).
- 배포 후 운영 HTML은 검증한 docs/index.html과 바이트 동일. SHA256 `39e185d7c051a6e9d4b4130cc164e82e629583aa88e72dc3fd2a13678db0e57d`. 마지막 원격 main 확인도04021a8과 일치.
- 신규 revision 오류 로그 조회: severity>=ERROR 0건(조회 시점·최대20 범위). 이는 정상 업무 실사용의 대체 증거가 아니다.
- 검증 범위: 합성 로컬 카드 HTML·권한/동시성·저장/timeout 회귀, 실제 demo Firestore 규칙/transaction, 운영 산출물 적용, 업무 읽기/쓰기 전 종료되는 HTTP4건. 운영 앱을 인증 사용자로 열어 신규학생/연락처를 조회하거나 mapping/clearance를 저장하지 않았다. **실제 운영 업무 기능 확인 미완료**로 남긴다.
- 실제 문자·알림톡 발송0. 관리자 테스트 수신번호 미지정. 프런트와 HTTP 및 provider send 모두 차단. 발송/결과 transport·웹훅 활성화와 관리자 번호 한정 발송 검증은 남은 단계이며, API 배포를 실제 전달 성공으로 표현하지 않는다.
- 이번 배포 관련 확인된 회귀/노출/오류 없음. 롤백 미실행. 직전 정상 HTML 및 Git 기준커밋은 보존했다. 사용자 업무·감사 원본 삭제/복원 없음.

재현 환경: Node22 (`npm exec --yes --package=node@22 -- node ...`), 기존 Firestore emulator1.19.8/Java21, UI DOM 시험용 jsdom26은 /tmp/timetable-alimtalk-test-tools에 --ignore-scripts로 별도 설치(릴리스 의존성에 포함하지 않음). 신규 runtime 의존성 및 운영 package-lock 변경 없음. 브라우저 검증 harness와 합성 fixture는 scripts/에 있으며 Pages docs/ 및 Functions source의 배포 실행 경로로 들어가지 않는다.

## 15. 관리자 전용 실제 전송·결과 연동 후속 (2026-10-28)

- 운영 관리자 로그인/시간표 카드 진입 확인. 학생 연결 inspect는 SOURCE_UNVERIFIED로 보류됨: 원본 파서의 보수적 문법/부분시간 보류로 실학생 발송 가능 상태가 아님. 보류를 우회하지 않음.
- 신규 관리자 테스트 경로는 고정 가상 학생·가상 수업만 사용하며 TIMETABLE_SOLAPI_TEST_PHONE 번호 이외 발송을 provider에서 거부. 일반 send는 HTTP/provider에서 차단 유지. 학생/보호자 원장 변경 없음.
- 사용자가 테스트 번호 secret 등록 완료. 상태 enabled 확인, 값 출력 없음. 웹훅 검증용 TIMETABLE_SOLAPI_WEBHOOK_SECRET 신규 생성(값 비공개). 두 secret을 기존 함수에 바인딩 예정.
- SOLAPI 승인 템플릿, 본문, 변수4개, 수업 문의 버튼을 읽기 API로 재확인. ATA 전용, disableSms=true, 각 요청 한 메시지, 재시도 없음. 조회는 저장된 messageId에만 limit2로 제한. ID가 없는 불명확 요청은 전체 목록을 탐색하거나 재발송하지 않음.
- 웹훅은 SHA1 헤더 검증 후 동일 delivery key/messageId/groupId 검증, 저장 후 응답. 타 업무 이벤트는 무시. 실제 등록/운영 확인은 별도 결과로 기록.
- Node22 전체75/75(에뮬레이터3건과 규칙 검사 포함), 기존서버30/30, 카드 검사3종 통과. 최초 실행은 에뮬레이터 시작 전 규칙검사 실패 후, 기동 후 전체 재실행75/75. PC 모의 요청은 접수로 표시, 모바일390px 패널 client315/scroll315.
- 공식 계약: https://solapi.com/developers/api/messages , https://solapi.com/developers/api/msg-getList , https://solapi.com/developers/api/msgstatus , https://solapi.com/developers/api/webhook
- 복구 기준: 이전 frontend04021a8 / server revision timetablealimtalkapi-00001-vis. 자신의 배포인지 확인 후 이전 소스의 해당 함수만 재배포하고 frontend 변경만 되돌림. 이력/원장 삭제 없음.
