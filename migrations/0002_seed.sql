INSERT INTO weeks(id,title,objective,why_text,follow_steps,tool_types) VALUES
(1,'AI Native 업무방식 이해','실제 업무 하나를 AI에게 맡겨 결과를 만들어 봅니다.','반복되는 현장 업무를 AI로 시작하되 최종 확인은 사람이 해야 합니다.','1. 반복 업무를 정합니다. 2. AI에 요청합니다. 3. 결과를 확인하고 수정합니다.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(2,'프롬프트 작성법','실제 업무에서 재사용할 프롬프트 하나를 완성합니다.','같은 품질의 공문·보고서 초안을 반복해서 만드는 출발점입니다.','업무·입력·출력형식·검증기준을 적고 실제 업무에 적용하세요.','["CHATGPT_CODEX","GEMINI_ANTIGRAVITY"]'),
(3,'AI 답변 검증과 자료조사','출처와 사실을 검증한 조사 결과를 만듭니다.','법령·시방서 관련 오류는 현장에서 큰 비용이 됩니다.','공식 출처를 찾고 AI 답변의 주장 3개 이상을 교차 확인하세요.','["CHATGPT_CODEX","GEMINI_ANTIGRAVITY"]'),
(4,'문서와 데이터 활용','문서나 데이터를 안전하게 분석해 업무 결과물을 만듭니다.','회의록과 작업일보에서 필요한 정보를 빠르게 뽑을 수 있습니다.','비밀정보를 제거한 샘플 자료를 분석하고 검토 결과를 제출하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(5,'AI에게 업무 Context 제공하기','지속적으로 사용할 업무 Context를 구성합니다.','현장 배경을 매번 설명하지 않으면 결과의 일관성이 높아집니다.','프로젝트 맥락·제약·용어·출력규칙을 한 문서로 정리하세요.','["CHATGPT_CODEX","GEMINI_ANTIGRAVITY"]'),
(6,'반복 업무 Workflow 만들기','입력→AI 처리→사람 확인→결과 흐름을 만듭니다.','사람의 검토 단계를 남겨 오류를 줄이면서 반복 업무를 단축합니다.','반복 업무를 고르고 단계별 담당자와 검증 포인트를 정의하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(7,'바이브 코딩 입문','간단한 웹페이지나 업무도구를 직접 만듭니다.','비개발자도 작은 현장 도구를 빠르게 시험할 수 있습니다.','도구 하나를 골라 만들고 사용 방법 및 화면을 제출하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(8,'실제 건설업무 웹앱 만들기','현장 업무의 입력과 조회가 가능한 도구를 만듭니다.','체크리스트·자재요청처럼 작지만 쓰이는 도구가 출발점입니다.','실제 문제를 정의하고 작동 화면·코드 또는 URL을 제출하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(9,'웹앱 개선과 실제 배포','입력·저장·조회·수정이 되는 모바일 웹앱을 배포합니다.','팀원이 접속할 수 있어야 업무도구의 가치가 생깁니다.','접속 URL과 기능별 검증 절차 및 결과를 제출하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(10,'개인 업무지식 구조 설계','업무정보를 다시 찾기 쉬운 구조로 정리합니다.','계약·공정·안전 자료가 흩어지면 경험이 축적되지 않습니다.','현장·계약·설계·공사·안전 등의 분류체계와 검색 규칙을 설계하세요.','["CHATGPT_CODEX","GEMINI_ANTIGRAVITY"]'),
(11,'AI Second Brain 구축','업무자료를 검색 가능한 개인 지식체계로 만듭니다.','필요한 근거를 찾을 수 있어야 AI의 답변도 검증할 수 있습니다.','샘플 지식체계를 만들고 실제 검색 사례를 제출하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]'),
(12,'나의 AI Native 업무 시스템','업무·AI·Workflow·도구·Second Brain을 연결합니다.','단편적인 실습을 실제 업무 시스템으로 바꾸는 최종 단계입니다.','전체 흐름과 실제 작동 근거, 한계, 개선 계획을 제출하세요.','["CHATGPT_CODEX","CLAUDE_CODE","GEMINI_ANTIGRAVITY"]');
INSERT INTO lessons(id,week_id,title,body,sort_order) SELECT 'lesson-'||id,id,'이번 주 핵심','실제 건설업무를 하나 선정하세요. AI의 결과를 그대로 사용하지 말고 근거와 품질을 확인한 뒤 최종 결과물을 만듭니다.',1 FROM weeks;
INSERT INTO assignments(id,week_id,title,description,instructions,evaluation_mode,pass_score,required_submission_types) SELECT 'assignment-'||id,id,title||' 실행과제',objective,'실제 실행 결과와 사용한 방법, 검증 내용, 개선한 점을 제출하세요. 기밀자료는 제거하세요.',CASE WHEN id=12 THEN 'HUMAN' WHEN id IN (8,9,11) THEN 'HYBRID' ELSE 'AI' END,80,'["TEXT","URL","GITHUB_URL","DEPLOYED_URL","IMAGE","PDF","DOCUMENT","EXCEL","ZIP","SCREENSHOT"]' FROM weeks;
INSERT INTO assignment_rubrics(id,assignment_id,name,description,max_score,sort_order) SELECT 'rubric-a-'||id,'assignment-'||id,'요구사항 충족','주차 목표에 맞는 실제 실행 결과와 구체적인 증거',40,1 FROM weeks;
INSERT INTO assignment_rubrics(id,assignment_id,name,description,max_score,sort_order) SELECT 'rubric-b-'||id,'assignment-'||id,'업무 적용성','건설 현장 업무와의 관련성 및 재사용 가능성',35,2 FROM weeks;
INSERT INTO assignment_rubrics(id,assignment_id,name,description,max_score,sort_order) SELECT 'rubric-c-'||id,'assignment-'||id,'검증과 개선','AI 결과 검증과 개선 과정의 명확성',25,3 FROM weeks;
INSERT INTO app_settings(key,value) VALUES ('ai_enabled','false'),('ai_model','gpt-4.1-mini'),('default_pass_score','80'),('confidence_threshold','0.75'),('upload_submission_mb','25'),('upload_pdf_mb','25'),('upload_image_mb','10'),('upload_video_mb','100');
INSERT INTO resources(id,guide_tool,title,description,resource_type,tool_type,url,sort_order,last_verified_at) VALUES
('guide-chatgpt','CHATGPT_CODEX','ChatGPT / Codex','대화·문서 분석·프로젝트 및 코드 작업. 계정을 만들고 공식 안내에 따라 시작하세요. 설치는 사용 방식에 따라 다릅니다. 오류가 나면 계정 권한과 도구 환경을 먼저 확인하세요.','EXTERNAL_URL','CHATGPT_CODEX','https://help.openai.com/',1,DATE('now')),
('guide-claude','CLAUDE_CODE','Claude Code','로컬 프로젝트를 이해하고 파일을 수정하는 코딩 도구. 공식 설치 가이드를 확인하세요. 터미널 권한과 로그인 문제를 먼저 확인하세요.','EXTERNAL_URL','CLAUDE_CODE','https://docs.anthropic.com/en/docs/claude-code/overview',1,DATE('now')),
('guide-gemini','GEMINI_ANTIGRAVITY','Gemini / Antigravity','Google 생태계에서 자료 조사와 에이전틱 작업을 수행합니다. 공식 안내에서 계정과 사용 가능 환경을 확인하세요.','EXTERNAL_URL','GEMINI_ANTIGRAVITY','https://ai.google.dev/',1,DATE('now'));
