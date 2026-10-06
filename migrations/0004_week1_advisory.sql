ALTER TABLE assignments ADD COLUMN is_advisory INTEGER NOT NULL DEFAULT 0 CHECK(is_advisory IN (0,1));
ALTER TABLE submissions ADD COLUMN advice_json TEXT;
ALTER TABLE submissions ADD COLUMN advice_error TEXT;

UPDATE weeks SET
  title='AI Native 업무방식 이해와 첫 업무 적용',
  objective='AI Native 업무방식이 필요한 이유를 이해하고, 내가 AI로 해결하고 싶은 업무를 선정합니다. AI의 도움을 예상해 작성하고, AI가 제안하는 수행 방법과 주의점을 확인합니다.',
  why_text='AI를 업무에 활용하려면 먼저 내가 해결하려는 문제를 명확하게 설명해야 합니다. 이번 주에는 내 업무를 돌아보고, AI가 도울 수 있는 부분과 사람이 판단해야 하는 부분을 구분합니다.',
  follow_steps='1. 교육영상 보기를 눌러 팝업에서 영상을 시청합니다.
2. AI로 해결하고 싶은 업무 하나를 선정합니다.
3. 현재 어려운 점과 AI가 어떻게 도와주면 좋을지 작성합니다.
4. AI에게 업무 적용 방법 물어보기를 누릅니다.
5. AI의 판단과 수행 방법을 확인합니다.
6. 열린 2주차 학습으로 이동합니다.',
  updated_at=CURRENT_TIMESTAMP
WHERE id=1;

UPDATE lessons SET title='AI와 함께 일할 내 업무 찾기',body='1. AI Native 업무방식 이해하기
관리자가 등록한 교육영상을 시청합니다.
내 업무에서 시간이 많이 들거나 반복되는 작업은 무엇인가요?
AI가 도와주면 좋겠다고 생각하는 부분은 무엇인가요?
AI를 활용하더라도 내가 직접 확인해야 할 부분은 무엇인가요?

2. AI로 해결하고 싶은 업무 선정하기
본인의 업무 중 AI의 도움을 받고 싶은 업무 하나를 선택합니다.
문서 작성, 자료 정리, 정보 검색, 데이터 분석 등 실제로 겪는 문제를 자유롭게 작성하세요.
아직 AI가 가능한지 모르더라도 괜찮습니다.

3. 내가 생각한 AI 활용 방법 작성하기
선택한 업무에서 AI가 어떻게 도와주면 좋을지 작성합니다.
예: 현장 회의 메모를 넣으면 회의록을 정리하고, 담당자별 조치사항을 표로 만들어 주면 좋겠습니다.

4. AI의 판단과 제안 확인하기
작성한 내용을 제출하면 AI가 도울 수 있는 부분, 수행 방법과 순서, 필요한 자료, 사람이 확인할 부분, 한계와 주의점을 안내합니다.
이번 주에는 점수나 합격·불합격 평가가 없습니다.
AI 활용이 어렵다는 판단이 나와도 안내를 받으면 1주차를 완료하고 2주차로 진행합니다.
AI 요청에 실패한 경우 작성한 내용은 저장되며 다시 요청할 수 있습니다.

자료 사용 원칙
실제 업무를 설명할 때 개인정보와 회사 기밀을 제거하세요. 필요한 경우 가상의 교육용 자료를 사용하세요.',updated_at=CURRENT_TIMESTAMP
WHERE id='lesson-1' AND week_id=1;

UPDATE assignments SET
  title='내 업무의 AI 적용 방법 알아보기',
  description='AI로 해결하고 싶은 업무와 현재 어려운 점, 기대하는 AI의 도움을 작성하고 AI의 판단과 수행 방법을 확인합니다. 별도 평가는 없습니다.',
  instructions='1. 해결하고 싶은 업무: 어떤 업무에 AI의 도움을 받고 싶나요?
2. 현재 어려운 점: 지금 어떻게 처리하고 있으며, 어떤 부분이 어렵거나 시간이 많이 드나요?
3. 기대하는 AI의 도움: AI가 어떤 작업을 해주면 좋을지 자유롭게 작성해 주세요.
회사 기밀과 개인정보는 제거하세요. AI 안내를 받으면 2주차가 열립니다.',
  is_advisory=1,
  evaluation_mode='AI',
  max_attempts=0,
  required_submission_types='["TEXT"]',
  ai_prompt='AI 초보자가 작성한 업무와 기대하는 도움을 검토하세요. 업무 이해, AI 활용 가능성, 단계별 수행 방법, 필요한 자료, 주의점과 첫 행동을 안내하세요. 실현 가능성을 무조건 긍정하지 마세요. 점수와 합격·불합격, 재제출 판정을 하지 마세요.',
  is_required=1,
  always_review=0,
  updated_at=CURRENT_TIMESTAMP
WHERE id='assignment-1' AND week_id=1;

DELETE FROM assignment_rubrics WHERE assignment_id='assignment-1';
