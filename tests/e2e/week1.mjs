import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Readable} from 'node:stream';
import worker from '../../src/worker.js';

// Run with Node 22+ and PLAYWRIGHT_MODULE pointing to an installed Playwright module.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const project=new URL('../../',import.meta.url),sqlite=new DatabaseSync(':memory:');
const migrations=(await readdir(new URL('migrations/',project))).filter(name=>name.endsWith('.sql')).sort();
assert.ok(migrations.includes('0004_week1_advisory.sql'),'Week 1 advisory migration is required');
assert.ok(migrations.some(name=>name.startsWith('0005_')),'Week 2 prompt practice migration is required');
for(const name of migrations)sqlite.exec(await readFile(new URL(`migrations/${name}`,project),'utf8'));
const DB={
  prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){return sqlite.prepare(sql).get(...args)||null;},
    async all(){return {results:sqlite.prepare(sql).all(...args)};},
    async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}
  };},
  async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
};
const objects=new Map(),FILES={
  async put(key,value){objects.set(key,Buffer.from(value));},
  async delete(key){objects.delete(key);},
  async get(key,options){const bytes=objects.get(key);if(!bytes)return null;
    const value=options?.range?.get('range'),match=/^bytes=(\d*)-(\d*)$/.exec(value||'');
    if(!match)return {body:bytes,size:bytes.length};
    const offset=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
    return {body:bytes.subarray(offset,end+1),size:bytes.length,range:{offset,length:end-offset+1}};
  }
};
const mime={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',jpg:'image/jpeg',webp:'image/webp'};
const ASSETS={async fetch(request){const pathname=new URL(request.url).pathname;
  if(pathname.includes('..'))return new Response('Not found',{status:404});
  try{return new Response(await readFile(new URL(`public${pathname}`,project)),{headers:{'Content-Type':mime[pathname.split('.').at(-1)]||'application/octet-stream'}});}
  catch{return new Response('Not found',{status:404});}
}};
const key=crypto.getRandomValues(new Uint8Array(32)),env={DB,FILES,ASSETS,APP_ENCRYPTION_KEY:Buffer.from(key).toString('base64')};
const iv=crypto.getRandomValues(new Uint8Array(12)),aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode('local-mock-key'));
sqlite.prepare('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)').run('openai_key',JSON.stringify({iv:Buffer.from(iv).toString('base64url'),encrypted_value:Buffer.from(encrypted).toString('base64url')}));
sqlite.prepare('UPDATE app_settings SET value=? WHERE key=?').run('true','ai_enabled');
for(const id of ['learner','retry-learner','admin']){
  sqlite.prepare('INSERT INTO users(id,google_sub,email,name,role,status,company_type) VALUES(?,?,?,?,?,?,?)').run(id,id,`${id}@example.test`,id,id==='admin'?'ADMIN':'USER','APPROVED','건설사');
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id))).toString('base64url');
  sqlite.prepare('INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,id,'2099-01-01');
}
const advice={summary:'회의 메모를 정리합니다.',feasibility:'초안 정리를 도울 수 있습니다.',steps:['회의 메모 준비','담당자별 조치사항 정리'],required_materials:['교육용 메모'],cautions:['담당자와 기한 확인'],first_action:'가상의 메모부터 준비하세요.'};
const originalFetch=globalThis.fetch;let providerFailure=false,providerCalls=0,gradeResult='PASS';
globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses','Only the mocked OpenAI endpoint may be called by the worker');providerCalls++;
  const payload=JSON.parse(options.body);let result=advice;
  if(payload.text.format.name==='evaluation'){
    const input=JSON.parse(payload.input),max=input.rubric.reduce((sum,r)=>sum+r.max_score,0);
    assert.equal(max,100);assert.equal(input.files.length,0);
    const scores=input.rubric.map(r=>Math.floor(r.max_score*0.9)),correction=90-scores.reduce((sum,score)=>sum+score,0);
    const criteria=input.rubric.map((r,i)=>({name:r.name,max_score:r.max_score,score:scores[i]+(i===scores.length-1?correction:0),evidence:'제출 본문의 프롬프트와 검증 기록'}));
    const image=input.additional_instruction.includes('design.md');
    if(image){assert.match(input.additional_instruction,/감점/);assert.equal(input.submission.includes('design.md'),false);}
    result={score:90,result:gradeResult,confidence:0.95,criteria,strengths:['업무 목적과 출력 형식 명시'],weaknesses:[],required_improvements:[],feedback:image?'핵심 요구사항을 충족했습니다. 다음에는 design.md로 디자인 기준을 정리해 보세요.':'조사 범위와 근거 확인 방법을 명시했습니다.'};
  }else assert.equal(payload.text.format.name,'workflow_advice');
  return providerFailure?Response.json({error:{message:'Mock outage'}},{status:503}):Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
};
let origin;
const server=createServer(async(incoming,outgoing)=>{
  try{
    const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
    const body=Buffer.concat(chunks),request=new Request(`${origin}${incoming.url}`,{method:incoming.method,headers:incoming.headers,...(body.length?{body}: {})});
    const response=await worker.fetch(request,env);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    if(incoming.method==='HEAD'){outgoing.end();return;}
    if(response.body)Readable.fromWeb(response.body).pipe(outgoing);else outgoing.end();
  }catch(error){outgoing.writeHead(500,{'Content-Type':'text/plain'});outgoing.end(error.stack);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const visible=async locator=>{await locator.waitFor({state:'visible'});};
const absent=async locator=>{await locator.first().waitFor({state:'detached'});assert.equal(await locator.count(),0);};
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('dialog')].every(d=>d.scrollWidth<=d.clientWidth)),'320px page or dialog overflow');
const api=async(page,path,body,method='GET')=>page.evaluate(async({path,body,method})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};},{path,body,method});
const context=async id=>{
  const c=await browser.newContext();await c.addCookies([{name:'sid',value:id,url:origin}]);
  await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await c.newPage();page.on('dialog',d=>d.accept());return page;
};
async function writeWorkflow(page){await page.goto(`${origin}/assignment?id=assignment-1`);
  await page.getByLabel('해결하고 싶은 업무',{exact:true}).fill('회의록 정리');
  await page.getByLabel('현재 어려운 점',{exact:true}).fill('담당자별 조치사항을 놓칩니다.');
  await page.getByLabel('기대하는 AI의 도움',{exact:true}).fill('회의 메모에서 조치사항을 정리해 주세요.');
  await page.getByRole('button',{name:'AI에게 업무 적용 방법 물어보기',exact:true}).click();
}
async function submitPrompt(page,id,text){await page.goto(`${origin}/assignment?id=${id}`);
  await page.getByLabel('제출 내용 · 프롬프트 · 검증 기록',{exact:true}).fill(text);
  await page.getByRole('button',{name:'제출하고 평가받기 →',exact:true}).click();
}
async function registerResource(admin,{title,type,url='',source='',file}){
  await admin.locator('[data-tab="resources"]').click();await admin.getByRole('button',{name:'+ 새 콘텐츠 추가',exact:true}).click();
  await admin.getByLabel('주차 (Guide면 비워두세요)',{exact:true}).fill('1');await admin.getByLabel('제목',{exact:true}).fill(title);
  await admin.getByLabel('유형',{exact:true}).selectOption(type);
  if(url)await admin.getByLabel('URL (YouTube / 외부 링크)',{exact:true}).fill(url);
  if(source)await admin.getByLabel(/^출처/).fill(source);
  if(file)await admin.getByLabel('PDF / 이미지 / MP4 / WebM 업로드',{exact:true}).setInputFiles(file);
  await admin.getByRole('button',{name:'콘텐츠 저장',exact:true}).click();await visible(admin.getByRole('heading',{name:'등록된 자료',exact:true}));
  assert.equal(sqlite.prepare('SELECT resource_type FROM resources WHERE title=?').get(title).resource_type,type);
  assert.equal(sqlite.prepare('SELECT source FROM resources WHERE title=?').get(title).source,source);
}
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const learner=await context('learner'),retry=await context('retry-learner'),admin=await context('admin');
  await learner.goto(`${origin}/week?id=2`);await visible(learner.getByRole('heading',{name:'아직 열리지 않은 주차입니다.',exact:true}));
  await writeWorkflow(learner);await visible(learner.getByRole('heading',{name:'AI 활용 가능성',exact:true}));
  await absent(learner.getByRole('heading',{name:'평가기준을 먼저 확인하세요',exact:true}));
  assert.doesNotMatch(await learner.locator('#assignment-app').innerText(),/PASS 기준|\d+점|AI 평가/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM evaluations').get().n,0);
  await learner.getByRole('link',{name:'2주차 학습 시작하기 →',exact:true}).click();await visible(learner.getByRole('heading',{name:'이번 주 목표',exact:true}));
  console.log('PASS: advice opens week 2 without grading');

  providerFailure=true;await writeWorkflow(retry);await visible(retry.getByRole('button',{name:'AI 안내 다시 요청하기',exact:true}));
  assert.match(await retry.locator('#assignment-app').innerText(),/회의록 정리/);
  const saved=sqlite.prepare('SELECT id,text_content FROM submissions WHERE user_id=?').get('retry-learner');
  assert.notEqual((await api(retry,'/api/weeks/2')).status,200);
  providerFailure=false;await retry.getByRole('button',{name:'AI 안내 다시 요청하기',exact:true}).click();await visible(retry.getByRole('heading',{name:'AI 활용 가능성',exact:true}));
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM submissions WHERE user_id=?').get('retry-learner').n,1);
  assert.equal(sqlite.prepare('SELECT text_content FROM submissions WHERE id=?').get(saved.id).text_content,saved.text_content);
  assert.equal((await api(retry,'/api/weeks/2')).status,200);console.log('PASS: saved failure retries and unlocks only on success');

  await admin.goto(`${origin}/admin`);await visible(admin.locator('[data-tab="resources"]'));
  await registerResource(admin,{title:'교육용 YouTube',type:'YOUTUBE',url:'https://youtu.be/dQw4w9WgXcQ',source:'교육영상 제작자'});
  let videoFile=process.env.TEST_VIDEO_FILE||'/private/tmp/axedu-week1-test.mp4';
  if(!existsSync(videoFile)){videoFile='/private/tmp/axedu-week1-e2e.mp4';execFileSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=320x180:r=24','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',videoFile],{stdio:'ignore'});}
  await registerResource(admin,{title:'교육용 업로드 영상',type:'VIDEO_FILE',file:videoFile});
  await learner.goto(`${origin}/week?id=1`);await learner.setViewportSize({width:320,height:740});
  const youtubeCard=learner.locator('article.item').filter({has:learner.getByRole('heading',{name:'교육용 YouTube',exact:true})}),youtube=youtubeCard.getByRole('button',{name:'교육영상 보기',exact:true});
  await visible(youtube);assert.match(await youtubeCard.innerText(),/교육영상 제작자/);
  const originalYoutube=youtubeCard.getByRole('link',{name:'YouTube 원본 보기 ↗',exact:true});
  assert.equal(await originalYoutube.getAttribute('href'),'https://youtu.be/dQw4w9WgXcQ');assert.equal(await originalYoutube.getAttribute('target'),'_blank');
  await absent(learner.locator('iframe'));await noOverflow(learner);await youtube.click();
  const youtubeDialog=learner.getByRole('dialog');await visible(youtubeDialog);assert.match(await youtubeDialog.innerText(),/교육영상 제작자/);
  assert.equal(await learner.locator('dialog iframe').getAttribute('src'),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(await learner.locator('dialog iframe').getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
  const originalDialog=youtubeDialog.getByRole('link',{name:'YouTube 원본 보기 ↗',exact:true});
  assert.equal(await originalDialog.getAttribute('href'),'https://youtu.be/dQw4w9WgXcQ');assert.equal(await originalDialog.getAttribute('target'),'_blank');await noOverflow(learner);
  await learner.getByRole('button',{name:'닫기',exact:true}).click();await absent(learner.locator('dialog, iframe'));assert.ok(await youtube.evaluate(node=>node===document.activeElement));
  await youtube.click();await learner.keyboard.press('Escape');await absent(learner.locator('dialog, iframe'));assert.ok(await youtube.evaluate(node=>node===document.activeElement));
  const uploaded=learner.locator('article.item').filter({has:learner.getByRole('heading',{name:'교육용 업로드 영상',exact:true})}).getByRole('button',{name:'교육영상 보기',exact:true});
  await uploaded.click();await learner.waitForFunction(()=>document.querySelector('dialog video')?.readyState>=2);
  await learner.evaluate(()=>{window.testVideo=document.querySelector('dialog video');return window.testVideo.play();});
  await learner.waitForFunction(()=>window.testVideo.currentTime>0.1);await noOverflow(learner);
  await learner.keyboard.press('Escape');await absent(learner.locator('dialog,video'));
  assert.ok(await learner.evaluate(()=>window.testVideo.paused&&!window.testVideo.hasAttribute('src')));assert.ok(await uploaded.evaluate(node=>node===document.activeElement));
  console.log('PASS: CMS upload, real MP4 playback, YouTube popup, cleanup, focus, Escape, and 320px layout');

  await admin.locator('[data-tab="assignments"]').click();await admin.getByRole('button',{name:'학습 활동 수정',exact:true}).click();
  assert.equal(await admin.getByLabel('학습 활동 방식',{exact:true}).inputValue(),'1');
  assert.equal(await admin.getByLabel('PASS 점수',{exact:true}).isVisible(),false);assert.equal(await admin.getByLabel('Rubric',{exact:true}).isVisible(),false);
  await admin.getByRole('button',{name:'과제 저장',exact:true}).click();await visible(admin.getByRole('heading',{name:'주차별 실행과제',exact:true}));
  assert.equal(sqlite.prepare("SELECT is_advisory FROM assignments WHERE id='assignment-1'").get().is_advisory,1);
  const week2=admin.locator('.item').filter({has:admin.getByText(/^Week 2 ·/)});await week2.getByRole('button',{name:'과제·Rubric 수정',exact:true}).first().click();
  assert.equal(await admin.getByLabel('PASS 점수',{exact:true}).isVisible(),true);assert.equal(await admin.getByLabel('Rubric',{exact:true}).isVisible(),true);
  await admin.locator('[data-tab="reviews"]').click();await admin.getByRole('button',{name:'전체',exact:true}).click();await admin.getByRole('button',{name:'상세 검수',exact:true}).first().click();
  await absent(admin.getByLabel('관리자 점수',{exact:true}));await absent(admin.getByRole('button',{name:'PASS 승인',exact:true}));await absent(admin.getByRole('button',{name:'AI 재평가',exact:true}));
  assert.equal((await api(admin,`/api/admin/reviews/${saved.id}/pass`,{score:100,comment:'forged'},'POST')).status,409);
  await learner.goto(`${origin}/assignment?id=assignment-2`);await visible(learner.getByRole('heading',{name:'평가기준을 먼저 확인하세요',exact:true}));
  console.log('PASS: advisory CMS persists without rubric, graded week 2 keeps rubric, admin cannot grade advice');
  sqlite.prepare('INSERT INTO submissions(id,assignment_id,user_id,attempt_number,text_content,status,review_reason) VALUES(?,?,?,?,?,?,?)').run('legacy-advisory','assignment-1','learner',2,'기존 1주차 작성 기록','HUMAN_REVIEW','legacy-advisory-fixture');
  await admin.locator('[data-tab="reviews"]').click();await visible(admin.getByRole('heading',{name:'제출물 목록',exact:true}));
  await absent(admin.getByRole('button',{name:'상세 검수',exact:true}));
  await admin.getByRole('button',{name:'전체',exact:true}).click();
  await admin.locator('.item').filter({hasText:'legacy-advisory-fixture'}).getByRole('button',{name:'상세 검수',exact:true}).click();
  await visible(admin.getByRole('heading',{name:'작성한 업무와 AI 안내',exact:true}));
  await absent(admin.getByLabel('관리자 점수',{exact:true}));await absent(admin.getByRole('button',{name:'PASS 승인',exact:true}));await absent(admin.getByRole('button',{name:'AI 재평가',exact:true}));
  console.log('PASS: legacy advisory stays out of grading queue and remains readable without grading controls');

  await learner.goto(`${origin}/week?id=2`);await visible(learner.getByRole('heading',{name:'이번 주 과제',exact:true}));
  const required=sqlite.prepare('SELECT id,title FROM assignments WHERE week_id=2 AND is_required=1 ORDER BY sort_order').all();
  assert.deepEqual(required.map(a=>a.id).sort(),['assignment-2-image','assignment-2-research']);
  for(const task of required)await visible(learner.getByRole('heading',{name:task.title,exact:true}));
  const researchLesson=learner.locator('article.item').filter({has:learner.getByRole('heading',{name:'Deep Research 프롬프트의 필수요소',exact:true})});
  const researchChecklist=await researchLesson.innerText();
  for(const item of ['목표와 질문','독자와 맥락','범위와 기준일','출처 우선순위','핵심 주장 인용','사실·추론·불확실성','출력 형식','검증 조건'])assert.ok(researchChecklist.includes(item),`Missing research checklist item: ${item}`);
  const imageLesson=learner.locator('article.item').filter({has:learner.getByRole('heading',{name:'이미지 생성 프롬프트의 필수요소',exact:true})});
  const imageChecklist=await imageLesson.innerText();
  for(const item of ['목적과 대상','배경과 장면','스타일·조명·팔레트','구도','형식','제외 조건','design.md','감점하지 않습니다'])assert.ok(imageChecklist.includes(item),`Missing image checklist item: ${item}`);
  const optional=learner.locator('details').filter({has:learner.getByText('선택 과제 및 이전 학습 기록',{exact:true})});
  assert.equal(await optional.getAttribute('open'),null);assert.equal(await optional.locator('a[href="/assignment?id=assignment-2"]').isVisible(),false);
  const video=sqlite.prepare("SELECT title,source,url FROM resources WHERE week_id=2 AND resource_type='YOUTUBE' AND url LIKE '%psEUVuDNoWk%'").get();assert.ok(video);assert.equal(video.source,'건설인 AX 생존지식');
  const videoCard=learner.locator('article.item').filter({has:learner.getByRole('heading',{name:video.title,exact:true})}),videoButton=videoCard.getByRole('button',{name:'교육영상 보기',exact:true});
  assert.match(await videoCard.innerText(),/건설인 AX 생존지식/);
  const week2Original=videoCard.getByRole('link',{name:'YouTube 원본 보기 ↗',exact:true});
  assert.equal(await week2Original.getAttribute('href'),'https://www.youtube.com/watch?v=psEUVuDNoWk&t=271s');assert.equal(await week2Original.getAttribute('target'),'_blank');
  const lab=learner.locator('a[href^="https://prompt-author-lab.vercel.app"]');
  assert.equal(new URL(await lab.getAttribute('href')).href,'https://prompt-author-lab.vercel.app/');assert.equal(await lab.getAttribute('target'),'_blank');
  const constructionLab=learner.locator('a[href^="https://prompt-author-labcon-brown.vercel.app"]');
  assert.equal(new URL(await constructionLab.getAttribute('href')).href,'https://prompt-author-labcon-brown.vercel.app/');assert.equal(await constructionLab.getAttribute('target'),'_blank');
  await learner.setViewportSize({width:320,height:740});await noOverflow(learner);await absent(learner.locator('iframe'));await videoButton.click();
  await visible(learner.getByRole('dialog'));assert.match(await learner.getByRole('dialog').innerText(),/건설인 AX 생존지식/);
  assert.equal(await learner.locator('dialog iframe').getAttribute('src'),'https://www.youtube-nocookie.com/embed/psEUVuDNoWk?start=271');
  assert.equal(await learner.locator('dialog iframe').getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
  const week2DialogOriginal=learner.getByRole('dialog').getByRole('link',{name:'YouTube 원본 보기 ↗',exact:true});
  assert.equal(await week2DialogOriginal.getAttribute('href'),video.url);assert.equal(await week2DialogOriginal.getAttribute('target'),'_blank');await noOverflow(learner);
  await learner.keyboard.press('Escape');await absent(learner.locator('dialog,iframe'));assert.ok(await videoButton.evaluate(node=>node===document.activeElement));
  console.log('PASS: week 2 required tasks, collapsed legacy task, Lab link, timestamped video, and mobile popup');

  const researchPrompt='조사 목적: 가상 현장 관리자의 안전교육 자료 준비. 원본: 현장 안전교육에 필요한 내용을 조사해 주세요. 점검표: 원본에 독자, 범위, 기준일, 출처와 검증 조건이 빠졌습니다. 수정본: 국내 소규모 현장의 신규 작업자 교육 항목과 참고 근거를 조사해 주세요. 기준일은 2026년 10월 6일이며 공식기관 원자료를 우선합니다. 주요 주장에 원문 링크와 발행일을 붙이고 사실과 추론을 구분하세요. 불확실성과 출처 충돌을 표시하세요. 출력은 요약, 교육 항목표, 근거와 한계입니다. 최신성, 국내 적용 범위와 인용 일치를 검증하고 확인되지 않은 사례는 만들지 마세요. 수정 이유: 조사 범위와 신뢰할 근거, 결과를 확인할 기준을 구체화했습니다. 다음 확인: 출처의 개정 여부.';
  await submitPrompt(learner,'assignment-2-research',researchPrompt);
  await visible(learner.getByText('이 과제를 PASS했습니다. 이번 주의 필수 과제를 모두 PASS하면 다음 주가 열립니다.',{exact:true}));
  assert.equal(sqlite.prepare("SELECT status FROM submissions WHERE user_id='learner' AND assignment_id='assignment-2-research'").get().status,'PASS');
  assert.notEqual((await api(learner,'/api/weeks/3')).status,200);await noOverflow(learner);
  await learner.goto(`${origin}/assignment?id=assignment-2-image`);await visible(learner.getByRole('heading',{name:'평가기준을 먼저 확인하세요',exact:true}));
  assert.match(await learner.locator('#assignment-app').innerText(),/design\.md/);assert.match(await learner.locator('#assignment-app').innerText(),/감점/);
  const imagePrompt='목적: 신규 작업자에게 정돈된 통로 안내. 원본: 안전한 현장 통로를 그려 주세요. 점검표: 원본에 구도, 화면 비율, 팔레트와 제외 조건이 빠졌습니다. 수정본: 가상의 건설현장 통로와 옆의 자재 적치 구역을 보여 주세요. 중앙 통로가 비어 있고 작업자가 통로를 걷는 장면입니다. 명확한 교육용 일러스트, 자연광, 파란색과 주황색 팔레트. 눈높이 시점, 16:9, 위쪽 제목 여백. 문자, 회사 로고와 개인정보는 제외하세요. 수정 이유: 교육 목적에 맞는 시각적 구분과 구도를 지정했습니다. 검증: 통로와 자재 구역이 구분되고 비율과 스타일이 충돌하지 않는지 확인합니다. 다음 확인: 제목 여백의 크기.';
  await learner.getByLabel('제출 내용 · 프롬프트 · 검증 기록',{exact:true}).fill(imagePrompt);await learner.getByRole('button',{name:'제출하고 평가받기 →',exact:true}).click();
  await visible(learner.getByText('핵심 요구사항을 충족했습니다. 다음에는 design.md로 디자인 기준을 정리해 보세요.',{exact:true}));
  assert.equal(sqlite.prepare("SELECT status FROM submissions WHERE user_id='learner' AND assignment_id='assignment-2-image'").get().status,'PASS');
  assert.equal((await api(learner,'/api/weeks/3')).status,200);await learner.goto(`${origin}/week?id=3`);await visible(learner.getByRole('heading',{name:'이번 주 목표',exact:true}));
  gradeResult='RETRY';await submitPrompt(retry,'assignment-2-research',researchPrompt);await visible(retry.getByRole('heading',{name:'수정해서 다시 제출하기',exact:true}));
  assert.equal(sqlite.prepare("SELECT status FROM submissions WHERE user_id='retry-learner' AND assignment_id='assignment-2-research'").get().status,'RETRY');
  assert.notEqual((await api(retry,'/api/weeks/3')).status,200);gradeResult='PASS';
  console.log('PASS: both required prompts unlock week 3, optional design.md gets advice, and RETRY with 90 points stays RETRY');
  assert.equal(providerCalls,6);console.log('Weeks 1–2 E2E passed (localhost only; mocked AI; no remote changes).');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));sqlite.close();globalThis.fetch=originalFetch;
}
