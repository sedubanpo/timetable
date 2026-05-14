# 운영 메모 설정

프론트에는 이미 선택형 운영 메모 레이어가 들어가 있습니다. `window.SEDU_OPERATION_MEMO_CONFIG`가 정의되지 않으면 기능은 비활성화되고, 라이브 시간표는 기존처럼 동작합니다.

## Supabase 테이블

1. Supabase 프로젝트를 생성하거나 기존 프로젝트를 엽니다.
2. SQL editor를 엽니다.
3. `supabase/operation_memos.sql` 내용을 실행합니다.

## 프론트 설정

테이블과 정책 준비가 끝난 뒤 아래 설정을 시간표 프론트에 주입합니다.

```html
<script>
  window.SEDU_OPERATION_MEMO_CONFIG = {
    provider: "supabase",
    url: "https://YOUR_PROJECT_ID.supabase.co",
    anonKey: "YOUR_SUPABASE_ANON_KEY",
    table: "operation_memos"
  };
</script>
```

이 설정은 실제 활성화 직전에만 추가합니다. 설정이 없으면 운영 메모 버튼, Supabase 호출, 학생명 경고 표시가 모두 비활성화됩니다.

## 활성화 확인

- 관리자 계정에서만 `운영 메모` 버튼이 보여야 합니다.
- 강사 계정과 2371 조회 계정에서는 입력 UI가 보이지 않아야 합니다.
- `2026-05-15 / 김하율` 메모를 만들면 `5/15` 시간표의 `김하율` 항목에 경고 표시가 붙어야 합니다.
- Supabase가 잠시 실패해도 시간표 본체는 정상 로드되어야 합니다.

## 보안 메모

첫 버전은 Supabase anon key를 사용하고, 쓰기 권한은 기존 시간표 관리자 UI 게이트를 신뢰합니다. 가벼운 운영 보조 기능으로는 사용할 수 있지만, 더 강한 보안이 필요해지면 쓰기 작업을 Supabase Edge Function 또는 GAS proxy로 옮겨 별도 관리자 토큰을 검사해야 합니다.
