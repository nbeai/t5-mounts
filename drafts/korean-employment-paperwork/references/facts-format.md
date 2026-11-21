# 사실표 꼴

## 근로계약서 (`payroll.mjs contract`)

```json
{
  "type": "정규 | 기간제 | 단시간",
  "employer": {"name": "상호", "representative": "대표자", "address": "주소", "phone": "연락처"},
  "employee": {"name": "이름", "address": "주소", "phone": "연락처"},
  "startDate": "2026-11-01", "endDate": "기간제·단시간이면 끝 날짜", "signDate": "작성일",
  "workplace": "근무 장소", "duties": "업무 내용",
  "workHours": "근로시간(예: 월~금 09:00~18:00)", "breakTime": "휴게시간",
  "weeklyContractHours": 40,
  "workDays": [{"day": "토", "hours": 7}],
  "wageType": "시급 | 월급", "wageAmount": 10000,
  "wageComponents": "임금 구성항목", "wageMethod": "계산방법", "payDay": "지급일", "payMethod": "지급방법",
  "holidays": "휴일", "annualLeave": "연차 유급휴가",
  "extra": [{"label": "4대보험", "text": "가입"}],
  "rules": {"minimumWage": null, "minimumWageSource": null}
}
```

`workDays` 는 단시간에만 법정 항목이다. `extra` 는 사람이 더 적고 싶은 조건(수습·사회보험·비밀 유지 등)을 그대로 넣는 칸 — 조건의 유불리를 판단해 더하지 않는다.

## 임금 (`payroll.mjs wage`)

```json
{
  "employer": {"name": "상호"}, "period": "2026년 10월", "payDate": "2026-11-10",
  "rules": {"minimumWage": null, "minimumWageSource": null, "overtimePremium": null, "rounding": "floor"},
  "employees": [{
    "name": "이름", "id": "사원번호(있으면)",
    "hourlyWage": 0, "weeklyContractHours": 40,
    "regularHours": 0, "paidWeeklyHolidayWeeks": 0,
    "overtimeHours": 0, "nightHours": 0, "holidayHours": 0, "holidayOver8Hours": 0,
    "allowances": [{"name": "식대", "amount": 0, "method": "정액"}],
    "deductions": [{"name": "국민연금", "amount": 0, "basis": "고지서"}]
  }]
}
```

- `rules`: `minimumWage`·`minimumWageSource` 는 그해 고시에서 사람이 확인한 값(yearly-values.md), `overtimePremium` 은 상시 5명 이상이면 true. 비어 있으면 계산이 멈추거나 `missing` 에 나온다.
- `regularHours`: 그달 소정근로로 일한 시간 합. `overtimeHours`: 연장근로 시간 합.
- `nightHours`: 위 시간 가운데 오후 10시~오전 6시에 든 시간. 가산분(0.5)만 더한다(이미 기본급·연장에 시간이 들어 있으므로).
- `paidWeeklyHolidayWeeks`: 그달 주휴를 받는 주 수(그 주 소정근로일을 개근한 주). 달에 걸친 주를 어느 달에 넣을지는 사업장 관행을 따른다.
- 월급제 직원은 `hourlyWage` 대신 `allowances` 에 기본급을 정액으로 넣는다(최저임금 대조는 시급 직원만 한다).

## 4대보험 신고 기한 (`payroll.mjs deadlines`)

```json
{"events": [{"name": "이름", "kind": "취득 | 상실", "date": "사유 발생일"}]}
```
