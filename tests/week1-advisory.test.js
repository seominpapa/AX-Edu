import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const workflow={task:'회의록 정리',difficulty:'조치사항을 놓칩니다.',expected_help:'담당자별로 정리해 주세요.'};
const advice={summary:'회의록을 정리합니다.',feasibility:'초안 정리를 도울 수 있습니다.',steps:['메모를 준비합니다.'],required_materials:[],cautions:['담당자를 확인하세요.'],first_action:'가상의 메모를 준비하세요.'};
const readMigration=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
async function setup({enabled=true,key=true}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readMigration('0001_initial.sql'));
  sqlite.exec(readMigration('0002_seed.sql'));
  sqlite.exec('ALTER TABLE assignments ADD COLUMN is_advisory INTEGER NOT NULL DEFAULT 0 CHECK(is_advisory IN (0,1)); ALTER TABLE submissions ADD COLUMN advice_json TEXT; ALTER TABLE submissions ADD COLUMN advice_error TEXT; UPDATE assignments SET is_advisory=1 WHERE id=\'assignment-1\';');
  sqlite.prepare('INSERT INTO users(id,google_sub,email,name,status) VALUES(?,?,?,?,?)').run('learner','learner','learner@example.test','학습자','APPROVED');
  sqlite.prepare('INSERT INTO users(id,google_sub,email,name,role,status) VALUES(?,?,?,?,?,?)').run('admin','admin','admin@example.test','관리자','ADMIN','APPROVED');
  for(const id of ['learner','admin']) {
    const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id))).toString('base64url');
    sqlite.prepare('INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,id,'2099-01-01');
  }
  sqlite.prepare('UPDATE app_settings SET value=? WHERE key=?').run(String(enabled),'ai_enabled');
  const secret=crypto.getRandomValues(new Uint8Array(32));
  const env={APP_ENCRYPTION_KEY:Buffer.from(secret).toString('base64'),DB:{
    prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};},
    async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  }};
  if(key){
    const iv=crypto.getRandomValues(new Uint8Array(12)),aes=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode('mock-key'));
    sqlite.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run('openai_key',JSON.stringify({iv:Buffer.from(iv).toString('base64url'),encrypted_value:Buffer.from(encrypted).toString('base64url')}));
  }
  const request=async(path,body,session='learner',method=body===undefined?'GET':'POST')=>{
    const response=await worker.fetch(new Request(`https://example.test${path}`,{method,headers:{Origin:'https://example.test','Content-Type':'application/json',...(session?{Cookie:`sid=${session}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:response.status,...await response.json()};
  };
  return {sqlite,env,request};
}
const aiResponse=value=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('advisory saves input first, returns advice without evaluations, and opens week 2',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    assert.equal(sqlite.prepare('SELECT status FROM submissions').get().status,'ADVICE_PENDING');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user_week_progress WHERE week_id=2').get().n,0);
    const payload=JSON.parse(options.body);assert.equal(payload.text.format.name,'workflow_advice');assert.ok(options.signal);
    assert.equal(payload.input.includes('FORGED SCORE'),false);
    return aiResponse({...advice,feasibility:'이 업무는 AI 자동 수행이 어렵습니다.'});
  });
  const result=await request('/api/assignments/assignment-1/submissions',{workflow,text_content:'FORGED SCORE',score:100,status:'PASS'});
  assert.equal(result.status,201);assert.equal(result.data.status,'COMPLETED');assert.deepEqual(JSON.parse(result.data.advice_json),{...advice,feasibility:'이 업무는 AI 자동 수행이 어렵습니다.'});
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM evaluations').get().n,0);
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE week_id=1').get().status,'COMPLETED');
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE week_id=2').get().status,'AVAILABLE');
  assert.match(sqlite.prepare('SELECT text_content FROM submissions').get().text_content,/회의록 정리/);
});
test('provider failure remains locked, stores safe error and retries same input',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());let fails=true;
  t.mock.method(globalThis,'fetch',async()=>fails?Response.json({error:{message:'SECRET PROVIDER DETAIL'}},{status:503}):aiResponse(advice));
  const result=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(result.data.status,'ADVICE_ERROR');
  assert.doesNotMatch(result.data.advice_error,/SECRET/);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user_week_progress WHERE week_id=2').get().n,0);
  const before=sqlite.prepare('SELECT text_content FROM submissions').get().text_content;fails=false;
  const retry=await request(`/api/submissions/${result.data.id}/advice`,{});assert.equal(retry.data.status,'COMPLETED');
  assert.equal(sqlite.prepare('SELECT text_content FROM submissions').get().text_content,before);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
  assert.equal((await request(`/api/submissions/${result.data.id}/advice`,{})).status,409);
});
test('invalid AI output never completes or creates evaluations',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  for(const invalid of [{...advice,score:100},{...advice,steps:[]},{...advice,summary:' '},{...advice,cautions:[42]}]) {
    t.mock.method(globalThis,'fetch',async()=>aiResponse(invalid));
    const result=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(result.data.status,'ADVICE_ERROR');t.mock.restoreAll();
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM evaluations').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user_week_progress WHERE week_id=2').get().n,0);
});
test('disabled AI and missing key retain submission without paid call',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('provider must not be called'));
  for(const options of [{enabled:false},{key:false}]) {
    const {sqlite,request}=await setup(options);
    const result=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(result.data.status,'ADVICE_ERROR');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='AI_ADVICE_REQUEST'").get().n,0);sqlite.close();
  }
});
test('advisory quota spans assignments and retries but is independent per user',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());let calls=0;
  const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));
  t.mock.method(globalThis,'fetch',async()=>{calls++;return aiResponse(advice);});
  sqlite.exec("INSERT INTO assignments(id,week_id,title,description,instructions,is_advisory,is_required) VALUES('other-advice',1,'다른 업무','설명','작성',1,0);");
  for(let i=0;i<10;i++){
    const assignment=i%2?'other-advice':'assignment-1';
    assert.equal((await request(`/api/assignments/${assignment}/submissions`,{workflow})).data.status,'COMPLETED');
  }
  const limited=await request('/api/assignments/assignment-1/submissions',{workflow:{...workflow,task:'새 업무 검토'}});
  assert.equal(limited.data.status,'ADVICE_ERROR');assert.equal(calls,10);
  assert.equal(limited.data.advice_error,'AI 안내는 사용자별로 1시간에 최대 10회 요청할 수 있습니다. 잠시 후 다시 요청해 주세요.');
  assert.match(sqlite.prepare('SELECT text_content FROM submissions WHERE id=?').get(limited.data.id).text_content,/새 업무 검토/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE actor_id='learner' AND action='AI_ADVICE_REQUEST'").get().n,10);
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE user_id=? AND week_id=1').get('learner').status,'COMPLETED');
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE user_id=? AND week_id=2').get('learner').status,'AVAILABLE');
  assert.equal((await request(`/api/submissions/${limited.data.id}/advice`,{})).data.status,'ADVICE_ERROR');assert.equal(calls,10);
  assert.equal(logs.at(-1)[1].code,'AI_RATE_LIMITED');
  assert.equal((await request('/api/assignments/assignment-1/submissions',{workflow},'admin')).data.status,'COMPLETED');assert.equal(calls,11);
  sqlite.exec("UPDATE audit_logs SET created_at=datetime('now','-2 hours') WHERE actor_id='learner' AND action='AI_ADVICE_REQUEST';");
  assert.equal((await request(`/api/submissions/${limited.data.id}/advice`,{})).data.status,'COMPLETED');assert.equal(calls,12);
});
test('provider failures consume advisory quota and attempts beyond quota make no call',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());let calls=0;
  t.mock.method(console,'error',()=>{});
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({},{status:503});});
  const first=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(first.data.status,'ADVICE_ERROR');
  for(let i=0;i<10;i++)assert.equal((await request(`/api/submissions/${first.data.id}/advice`,{})).data.status,'ADVICE_ERROR');
  assert.equal(calls,10);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='AI_ADVICE_REQUEST'").get().n,10);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user_week_progress WHERE week_id=2').get().n,0);
});
test('workflow, session approval, ownership, and advisory guards prevent misuse',async t=>{
  const {sqlite,request}=await setup({enabled:false});t.after(()=>sqlite.close());
  assert.equal((await request('/api/assignments/assignment-1/submissions',{workflow},null)).status,401);
  for(const value of [null,{}, {...workflow,task:' '},{...workflow,expected_help:'a'.repeat(5001)}])assert.equal((await request('/api/assignments/assignment-1/submissions',{workflow:value,text_content:'forged'})).status,400);
  const result=await request('/api/assignments/assignment-1/submissions',{workflow});
  assert.equal((await request(`/api/submissions/${result.data.id}/advice`,{},'admin')).status,404);
  sqlite.prepare('UPDATE users SET status=? WHERE id=?').run('PENDING','learner');
  assert.equal((await request(`/api/submissions/${result.data.id}/advice`,{})).status,403);
  sqlite.prepare('UPDATE users SET status=? WHERE id=?').run('APPROVED','learner');
  for(const action of ['pass','retry','reevaluate'])assert.equal((await request(`/api/admin/reviews/${result.data.id}/${action}`,{score:100,comment:'pass'},'admin')).status,409);
});
test('failed later request does not erase completed progress',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());let fails=false;
  t.mock.method(globalThis,'fetch',async()=>fails?Response.json({},{status:500}):aiResponse(advice));
  await request('/api/assignments/assignment-1/submissions',{workflow});fails=true;
  const second=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(second.data.status,'ADVICE_ERROR');
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE week_id=1').get().status,'COMPLETED');
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE week_id=2').get().status,'AVAILABLE');
});
test('old graded review states do not block a new plan after advisory conversion',async t=>{
  t.mock.method(globalThis,'fetch',async()=>aiResponse(advice));
  for(const status of ['HUMAN_REVIEW','SUBMITTED','AI_REVIEW']) {
    const {sqlite,request}=await setup();
    sqlite.prepare('INSERT INTO submissions(id,user_id,assignment_id,attempt_number,status,text_content) VALUES(?,?,?,?,?,?)').run('legacy','learner','assignment-1',1,status,'기존 제출');
    const result=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(result.status,201);assert.equal(result.data.status,'COMPLETED');assert.equal(result.data.attempt_number,2);
    assert.equal(sqlite.prepare("SELECT status FROM submissions WHERE id='legacy'").get().status,status);sqlite.close();
  }
});
test('pending requests cannot be submitted or retried twice',{timeout:2000},async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());let release,started;
  const began=new Promise(resolve=>{started=resolve;});
  t.mock.method(globalThis,'fetch',async()=>{started();await new Promise(resolve=>{release=resolve;});return aiResponse(advice);});
  const pending=request('/api/assignments/assignment-1/submissions',{workflow});await began;
  assert.equal((await request('/api/assignments/assignment-1/submissions',{workflow})).status,409);
  const id=sqlite.prepare('SELECT id FROM submissions').get().id;
  assert.equal((await request(`/api/submissions/${id}/advice`,{})).status,409);release();await pending;
});
test('advice and progress commit atomically if completion storage fails',async t=>{
  const {sqlite,env,request}=await setup();t.after(()=>sqlite.close());
  t.mock.method(globalThis,'fetch',async()=>aiResponse(advice));
  const batch=env.DB.batch.bind(env.DB);let first=true;
  t.mock.method(env.DB,'batch',async statements=>{
    if(first){first=false;const failing=env.DB.prepare('INSERT INTO no_such_table(value) VALUES(1)');return batch([...statements.slice(0,1),failing,...statements.slice(1)]);}
    return batch(statements);
  });
  const result=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(result.data.status,'ADVICE_ERROR');assert.equal(result.data.advice_json,null);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM user_week_progress WHERE week_id=2').get().n,0);
});
test('CMS advisory config accepts only binary flags, requires TEXT and removes rubrics',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  const form={week_id:1,title:'업무 안내',description:'설명',instructions:'작성하세요.',is_required:1,is_advisory:true,required_submission_types:['TEXT'],rubrics:[]};
  const created=await request('/api/admin/assignments',form,'admin');assert.equal(created.status,200);
  const assignment=sqlite.prepare('SELECT * FROM assignments WHERE id=?').get(created.data.id);assert.equal(assignment.is_advisory,1);assert.equal(assignment.evaluation_mode,'AI');
  assert.equal((await request('/api/admin/assignments',{...form,is_advisory:'true'},'admin')).status,400);
  assert.equal((await request('/api/admin/assignments',{...form,required_submission_types:['PDF']},'admin')).status,400);
  assert.equal((await request('/api/admin/assignments',{...form,is_advisory:0,evaluation_mode:'AI',pass_score:80},'admin')).status,400);
  const saved=await request('/api/admin/assignments/assignment-1',form,'admin','PUT');assert.equal(saved.status,200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM assignment_rubrics WHERE assignment_id='assignment-1'").get().n,0);
});
test('CMS accepts only YouTube URLs supported by the shared popup parser',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  const form={week_id:1,title:'교육영상',resource_type:'YOUTUBE'};
  for(const url of ['https://www.youtu.be/dQw4w9WgXcQ','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'])assert.equal((await request('/api/admin/resources',{...form,url},'admin')).status,201);
  for(const url of ['https://youtube.com/watch?v=invalidyoutubeID','https://youtu.be/short','https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ','https://youtu.be.attacker.test/dQw4w9WgXcQ'])assert.equal((await request('/api/admin/resources',{...form,url},'admin')).status,400);
});
test('advisory failure logs only safe internal code and submission ID',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  const messages=[];t.mock.method(console,'error',(...args)=>messages.push(args));
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('SECRET_KEY PROVIDER_USER_DATA');});
  const result=await request('/api/assignments/assignment-1/submissions',{workflow});assert.equal(result.data.status,'ADVICE_ERROR');
  assert.equal(messages.length,1);assert.equal(messages[0][1].submission_id,result.data.id);assert.equal(messages[0][1].code,'AI_ADVICE_FAILED');
  assert.doesNotMatch(JSON.stringify(messages),/SECRET_KEY|PROVIDER_USER_DATA|회의록|mock-key/);
});
test('week 2 still uses grading and rubric path',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  sqlite.prepare('INSERT INTO user_week_progress(user_id,week_id,status) VALUES(?,?,?)').run('learner',1,'COMPLETED');
  t.mock.method(globalThis,'fetch',async()=>aiResponse({score:90,result:'PASS',confidence:0.95,criteria:[{name:'요구사항',score:90,max_score:100,evidence:'실행'}],strengths:[],weaknesses:[],required_improvements:[],feedback:'완료'}));
  const result=await request('/api/assignments/assignment-2/submissions',{text_content:'실습 결과'});assert.equal(result.status,201);assert.equal(result.data.status,'PASS');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM evaluations').get().n,1);
  const id=sqlite.prepare('SELECT id FROM submissions').get().id;assert.equal((await request(`/api/submissions/${id}/advice`,{})).status,409);
});
test('migration modifies only seeded week 1 content and preserves history/resources',()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readMigration('0001_initial.sql'));sqlite.exec(readMigration('0002_seed.sql'));
  sqlite.exec("INSERT INTO lessons(id,week_id,title,body) VALUES('custom',1,'관리자 자료','유지'); INSERT INTO resources(id,week_id,title,resource_type,url) VALUES('custom-video',1,'영상','YOUTUBE','https://youtu.be/example');");
  sqlite.exec("INSERT INTO users(id,google_sub,email,name) VALUES('old','old','old@example.test','기존'); INSERT INTO submissions(id,user_id,assignment_id,attempt_number,status) VALUES('old-submission','old','assignment-1',1,'PASS'); INSERT INTO evaluations(id,submission_id,evaluator_type,score,result,feedback_json) VALUES('old-evaluation','old-submission','AI',90,'PASS','{}'); INSERT INTO assignments(id,week_id,title,description,instructions) VALUES('custom-assignment',1,'추가','유지','유지');");
  sqlite.exec(readMigration('0004_week1_advisory.sql'));
  assert.equal(sqlite.prepare('SELECT title FROM weeks WHERE id=1').get().title,'AI Native 업무방식 이해와 첫 업무 적용');
  assert.equal(sqlite.prepare("SELECT is_advisory FROM assignments WHERE id='assignment-1'").get().is_advisory,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM assignment_rubrics WHERE assignment_id='assignment-1'").get().n,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM assignment_rubrics WHERE assignment_id='assignment-2'").get().n,3);
  assert.equal(sqlite.prepare("SELECT body FROM lessons WHERE id='custom'").get().body,'유지');
  assert.equal(sqlite.prepare("SELECT status FROM submissions WHERE id='old-submission'").get().status,'PASS');
  assert.equal(sqlite.prepare("SELECT score FROM evaluations WHERE id='old-evaluation'").get().score,90);
  assert.equal(sqlite.prepare("SELECT description FROM assignments WHERE id='custom-assignment'").get().description,'유지');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM resources WHERE id='custom-video'").get().n,1);sqlite.close();
});
