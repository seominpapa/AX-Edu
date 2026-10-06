import {$,el,clear,request,send,getMe,nav,pill,badge,date,fmtFeedback,alertError} from './common.js';
nav('12주 과정');const root=$('#assignment-app'),id=new URLSearchParams(location.search).get('id');let currentFiles=[];
function feedbackCard(s){const card=el('article',{class:'card'},[el('div',{class:'flex between'},[el('h3',{text:`${s.attempt_number}차 제출 · ${date(s.created_at)}`}),pill(s.status)]),el('p',{class:'content-text',text:s.text_content||'텍스트 제출 없음'})]);if(s.submitted_url)card.append(el('a',{class:'link',href:s.submitted_url,target:'_blank',rel:'noopener noreferrer',text:'제출 URL ↗'}));for(const f of s.files)card.append(el('p',{},[el('a',{class:'link',href:`/api/files/${f.id}`,target:'_blank',text:`첨부: ${f.original_filename}`})]));for(const v of s.evaluations){const f=fmtFeedback(v.feedback_json),box=el('div',{class:'item'},[el('div',{class:'flex'},[badge(v.evaluator_type==='AI'?'AI 평가':'관리자 평가'),pill(v.result),el('strong',{text:v.score!==null?`${v.score}점`:''})]),el('p',{class:'content-text',text:f.feedback||''})]);for(const [key,title] of [['strengths','잘한 점'],['weaknesses','부족한 점'],['required_improvements','반드시 수정할 항목']])if(f[key]?.length)box.append(el('p',{class:'content-text',text:`${title}: ${f[key].join(' · ')}`}));if(f.criteria?.length)f.criteria.forEach(c=>box.append(el('p',{class:'tiny',text:`${c.name} ${c.score}/${c.max_score} · ${c.evidence}`})));card.append(box)}if(s.status==='RETRY')card.append(el('button',{class:'btn ghost small',type:'button',text:'평가 이의신청',onClick:async()=>{if(!confirm('관리자에게 평가 재검토를 요청하시겠습니까?'))return;try{await send(`/api/submissions/${s.id}/appeal`,{});load()}catch(e){alertError(e)}}}));return card}
async function load(){const me=await getMe();if(!me)return;try{const {assignment:a,rubrics,submissions}=await request(`/api/assignments/${id}`);if(a.is_advisory){renderAdvisory(a,submissions);return}clear(root);root.append(el('a',{class:'link',href:`/week?id=${a.week_id}`,text:`← Week ${a.week_id} 학습으로 돌아가기`}));root.append(el('section',{style:'margin:26px 0 28px'},[el('p',{class:'eyebrow',text:`WEEK ${String(a.week_id).padStart(2,'0')} / EXECUTION TASK`}),el('h1',{text:a.title}),el('p',{class:'lead',text:a.description})]));const layout=el('div',{class:'columns'}),body=el('div',{class:'stack'}),intro=el('section',{class:'card'},[el('h2',{text:'이번 주에 제출할 결과물'}),el('p',{class:'content-text',text:a.instructions}),el('p',{class:'tiny',text:`평가 방식: ${a.evaluation_mode} · PASS 기준: ${a.pass_score}점${a.max_attempts?` · 최대 ${a.max_attempts}회`:' · 재도전 가능'}`})]);body.append(intro);const rubric=el('section',{class:'card'},[el('h2',{text:'평가기준을 먼저 확인하세요'})]);for(const r of rubrics)rubric.append(el('div',{class:'item'},[el('div',{class:'flex between'},[el('strong',{text:r.name}),badge(`${r.max_score}점`)]),el('p',{text:r.description})]));body.append(rubric);
 const canSubmit=!submissions.length||submissions[0].status==='RETRY';const form=el('form',{class:'card'},[el('p',{class:'eyebrow',text:'YOUR TURN'}),el('h2',{text:canSubmit?submissions.length?'수정해서 다시 제출하기':'결과물 제출하기':'제출한 결과물'})]);if(canSubmit){form.append(el('div',{class:'notice',text:'회사 기밀자료, 개인정보, 계약상 외부 반출이 금지된 문서는 업로드하지 마십시오. 실제 자료 사용이 어려운 경우 교육용 샘플자료를 사용하십시오.'}));const allowed=JSON.parse(a.required_submission_types);if(allowed.includes('TEXT'))form.append(el('div',{class:'form-row'},[el('label',{for:'answer',text:'제출 내용 · 프롬프트 · 검증 기록'}),el('textarea',{id:'answer',name:'text_content',placeholder:'과제 안내에 따라 제출할 내용을 작성하세요.'} )]));if(['URL','GITHUB_URL','DEPLOYED_URL'].some(t=>allowed.includes(t)))form.append(el('div',{class:'form-row'},[el('label',{for:'submitted-url',text:'결과물 URL (선택)'}),el('input',{id:'submitted-url',name:'submitted_url',type:'url',placeholder:'https://...'})]));if(allowed.some(t=>['PDF','IMAGE','SCREENSHOT','DOCUMENT','EXCEL','ZIP'].includes(t))){const wrap=el('div',{class:'form-row'},[el('label',{for:'attachment',text:'파일 첨부 (선택, 최대 10개)'}),el('input',{id:'attachment',type:'file',multiple:''}),el('p',{class:'tiny',text:'파일은 제출 전에 비공개 저장소에 업로드됩니다.'})]),fileList=el('div',{class:'tiny'});wrap.append(fileList);form.append(wrap);$('#attachment',form).addEventListener('change',async e=>{for(const file of e.target.files){const ext=file.name.split('.').pop().toLowerCase(),type=['pdf'].includes(ext)?'PDF':['jpg','jpeg','png','webp'].includes(ext)?'IMAGE':['doc','docx','txt'].includes(ext)?'DOCUMENT':['xls','xlsx','csv'].includes(ext)?'EXCEL':'ZIP';if(!allowed.includes(type)&&!(type==='IMAGE'&&allowed.includes('SCREENSHOT')))continue;try{const r=await request(`/api/files?type=${type}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','Content-Length':String(file.size),'X-File-Name':encodeURIComponent(file.name)},body:file});currentFiles.push(r.id);fileList.append(el('p',{text:`업로드 완료 · ${file.name}`}))}catch(err){alertError(err)}}})}form.append(el('button',{class:'btn',type:'submit',text:submissions.length?'재제출하고 평가받기 →':'제출하고 평가받기 →'}));form.addEventListener('submit',async e=>{e.preventDefault();const button=$('button[type=submit]',form);button.disabled=true;button.textContent='제출·평가 중입니다...';try{const values=Object.fromEntries(new FormData(form));await send(`/api/assignments/${id}/submissions`,{text_content:values.text_content||'',submitted_url:values.submitted_url||'',file_ids:currentFiles});currentFiles=[];await load()}catch(err){alertError(err)}finally{button.disabled=false;button.textContent='제출하고 평가받기 →'}})}else form.append(el('p',{class:'muted',text:submissions[0]?.status==='PASS'?'이 과제를 PASS했습니다. 이번 주의 필수 과제를 모두 PASS하면 다음 주가 열립니다.':'평가가 진행 중입니다. 결과가 나올 때까지 기다려 주세요.'}));body.append(form);if(submissions.length){const history=el('section',{class:'stack'},[el('h2',{text:'제출 및 평가 기록'})]);submissions.forEach(s=>history.append(feedbackCard(s)));body.append(history)}const side=el('aside',{class:'card side'},[el('p',{class:'eyebrow',text:'PASS TO UNLOCK'}),el('h2',{text:'다음 주는 결과물로 엽니다'}),el('p',{class:'muted',text:'이번 주의 필수 과제를 모두 PASS하면 다음 주가 열립니다. 피드백을 보고 보완한 뒤 다시 제출하세요.'}),el('hr',{class:'divider'}),el('p',{class:'tiny',text:'제출 파일은 비공개로 저장되며 본인과 관리자만 열람할 수 있습니다.'})]);layout.append(body,side);root.append(layout)}catch(e){clear(root);root.append(el('div',{class:'card empty'},[el('h2',{text:'과제를 열 수 없습니다.'}),el('p',{text:e.message}),el('a',{class:'btn',href:'/dashboard',text:'돌아가기'})]))}}load();

function adviceCard(s){
 const advisoryStatus=['COMPLETED','ADVICE_PENDING','ADVICE_ERROR'].includes(s.status);
 const card=el('article',{class:'card'},[el('div',{class:'flex between'},[el('h3',{text:`${s.attempt_number}차 작성 · ${date(s.created_at)}`}),advisoryStatus?pill(s.status):badge('이전 작성 기록')]),el('p',{class:'content-text',text:s.text_content||''})]);
 if(s.status==='COMPLETED'){
  const advice=fmtFeedback(s.advice_json);
  for(const [key,title] of [['summary','업무 이해'],['feasibility','AI 활용 가능성'],['steps','업무 수행 방법'],['required_materials','필요한 자료'],['cautions','주의점'],['first_action','처음 시도할 작업']]){
   const content=advice[key],section=el('section',{class:'item'},[el('h3',{text:title})]);
   if(Array.isArray(content))section.append(el(key==='steps'?'ol':'ul',{},content.map(text=>el('li',{class:'content-text',text}))));
   else section.append(el('p',{class:'content-text',text:content||'별도 안내 없음'}));
   card.append(section);
  }
 }
 if(s.status==='ADVICE_ERROR'){
  card.append(el('p',{class:'notice',role:'status',text:s.advice_error||'AI 안내를 받지 못했습니다. 작성한 내용은 저장되어 있습니다. 다시 요청해 주세요.'}));
  const retry=el('button',{class:'btn secondary',type:'button',text:'AI 안내 다시 요청하기',onClick:async()=>{
   if(retry.disabled)return;retry.disabled=true;retry.textContent='AI 안내를 요청하고 있습니다...';
   try{await send(`/api/submissions/${s.id}/advice`,{});await load()}catch(e){alertError(e)}finally{retry.disabled=false;retry.textContent='AI 안내 다시 요청하기'}
  }});card.append(retry);
 }
 if(s.status==='ADVICE_PENDING')card.append(el('p',{class:'notice',role:'status',text:'AI가 업무 적용 방법을 정리하고 있습니다.'}),el('button',{class:'btn secondary',type:'button',text:'안내 결과 확인하기',onClick:load}));
 return card;
}
function renderAdvisory(a,submissions){
 clear(root);root.append(el('a',{class:'link',href:`/week?id=${a.week_id}`,text:`← Week ${a.week_id} 학습으로 돌아가기`}),el('section',{style:'margin:26px 0 28px'},[el('p',{class:'eyebrow',text:`WEEK ${String(a.week_id).padStart(2,'0')} / AI WORKFLOW`}),el('h1',{text:a.title}),el('p',{class:'lead',text:a.description})]));
 const layout=el('div',{class:'columns'}),body=el('div',{class:'stack'});
 body.append(el('section',{class:'card'},[el('h2',{text:'내 업무에 AI 적용하기'}),el('p',{class:'content-text',text:a.instructions}),el('p',{class:'notice success',text:'이번 주에는 별도 평가가 없습니다. AI 판단 결과를 받으면 다음 주 학습이 열립니다.'})]));
 const latest=submissions[0],canSubmit=!['ADVICE_PENDING','ADVICE_ERROR'].includes(latest?.status);
 if(canSubmit){
  const form=el('form',{class:'card'},[el('h2',{text:submissions.length?'다른 업무도 살펴보기':'AI로 해결하고 싶은 업무 작성하기'}),el('p',{class:'tiny',text:'회사 기밀과 개인정보는 입력하지 마세요. 교육용 사례로 작성해도 됩니다.'})]);
  for(const [name,label,placeholder] of [['task','해결하고 싶은 업무','어떤 업무에 AI의 도움을 받고 싶나요?'],['difficulty','현재 어려운 점','현재 처리 방법과 어렵거나 시간이 많이 드는 부분을 작성해 주세요.'],['expected_help','기대하는 AI의 도움','AI가 어떤 작업을 도와주면 좋을지 작성해 주세요.']]){
   form.append(el('div',{class:'form-row'},[el('label',{for:name,text:label}),el('textarea',{id:name,name,required:'',maxlength:'4000',placeholder})]));
  }
  const button=el('button',{class:'btn',type:'submit',text:'AI에게 업무 적용 방법 물어보기'});form.append(button);
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(button.disabled)return;
   const workflow=Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,value.trim()]));
   for(const [key,value] of Object.entries(workflow)){const control=form.elements.namedItem(key);control.setCustomValidity(value?'':'내용을 입력해 주세요.');if(!value){control.reportValidity();return}}
   button.disabled=true;button.textContent='AI가 업무 적용 방법을 정리하고 있습니다...';
   try{await send(`/api/assignments/${id}/submissions`,{workflow,text_content:`해결하고 싶은 업무: ${workflow.task}\n현재 어려운 점: ${workflow.difficulty}\n기대하는 AI의 도움: ${workflow.expected_help}`,submitted_url:'',file_ids:[]});await load()}
   catch(err){alertError(err)}finally{button.disabled=false;button.textContent='AI에게 업무 적용 방법 물어보기'}
  });
  form.addEventListener('input',e=>e.target.setCustomValidity?.(''));
  body.append(form);
 }
 if(submissions.length){const history=el('section',{class:'stack'},[el('h2',{text:'작성한 업무와 AI 안내'})]);submissions.forEach(s=>history.append(adviceCard(s)));body.append(history)}
 const side=el('aside',{class:'card side'},[el('p',{class:'eyebrow',text:'NEXT ACTION'}),el('h2',{text:'AI 판단을 다음 학습으로 연결하기'}),el('p',{class:'muted',text:'AI의 제안을 읽고 준비할 자료와 첫 작업을 확인하세요. 활용이 어렵다는 안내를 받아도 학습은 완료됩니다.'})]);
 if(submissions.some(s=>s.status==='COMPLETED')&&a.week_id<12)side.append(el('a',{class:'btn',href:`/week?id=${a.week_id+1}`,text:`${a.week_id+1}주차 학습 시작하기 →`}));
 layout.append(body,side);root.append(layout);
}
