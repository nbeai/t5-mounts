# 사실표 꼴 (`reminder.mjs --facts`)

```json
{
  "creditor": {"name": "내 상호·이름", "representative": "대표자", "address": "주소", "phone": "연락처", "account": "받을 계좌"},
  "debtor": {"name": "거래처 이름", "representative": "대표자", "address": "주소", "phone": "연락처"},
  "items": [{"date": "2026-07-15", "description": "거래 내용", "amount": 3300000, "docs": ["용역계약서.pdf"]}],
  "payments": [{"date": "2026-07-20", "amount": 1100000}],
  "events": [{"date": "2026-08-15", "text": "카톡으로 8월 말까지 주겠다고 함"}],
  "evidence": ["대화/카톡_20260815.png"],
  "dueDate": "원래 지급 기한",
  "newDeadline": "내용증명에서 요청할 기한",
  "letterDate": "내용증명 작성일(없으면 오늘)",
  "subject": "제목"
}
```

- 금액은 원 단위 정수. 부가세 포함 여부는 청구서·계약서에 적힌 대로(이 방법은 다시 셈하지 않는다).
- `events` 는 자료에 있는 사실만(약속한 날짜, 받은 연락). 짐작·평가를 넣지 않는다.
- `docs`·`evidence` 는 증거 폴더 안 파일 이름(하위 폴더면 `대화/파일.png`). 폴더에 없으면 자료표에 「없음」으로 나온다.
- 주민등록번호는 넣지 않는다. 지급명령 신청에 필요한 상대방 정보는 사람이 신청할 때 직접 적는다.
