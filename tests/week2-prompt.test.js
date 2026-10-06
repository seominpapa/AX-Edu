import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const migration=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const tasks=['assignment-2-research','assignment-2-image'];
function database(applyWeek2=true){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0001_initial.sql','0002_seed.sql','0003_ui_theme.sql','0004_week1_advisory.sql'])sqlite.exec(migration(name));
  sqlite.exec("INSERT INTO users(id,google_sub,email,name,status) VALUES('learner','learner','learner@example.test','학습자','APPROVED'); INSERT INTO user_week_progress(user_id,week_id,status) VALUES('learner',1,'COMPLETED'); INSERT INTO submissions(id,assignment_id,user_id,attempt_number,text_content,status) VALUES('old-pass','assignment-2','learner',1,'이전 과제','PASS'); INSERT INTO evaluations(id,submission_id,evaluator_type,score,result,feedback_json) VALUES('old-evaluation','old-pass','AI',90,'PASS','{}');");
  if(applyWeek2)sqlite.exec(migration('0005_week2_prompt_practice.sql'));
  return sqlite;
}
async function setup({migrated=true}={}){
  const sqlite=database(migrated),secret=crypto.getRandomValues(new Uint8Array(32));
  const env={APP_ENCRYPTION_KEY:Buffer.from(secret).toString('base64'),DB:{
    prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};},
    async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  }};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('test-session'));
  sqlite.prepare('INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)').run(Buffer.from(digest).toString('base64url'),'learner','2099-01-01');
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('mock-key'));
  sqlite.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run('openai_key',JSON.stringify({iv:Buffer.from(iv).toString('base64url'),encrypted_value:Buffer.from(encrypted).toString('base64url')}));
  sqlite.exec("UPDATE app_settings SET value='true' WHERE key='ai_enabled';");
  const request=async(path,body)=>{
    const response=await worker.fetch(new Request(`https://example.test${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:'sid=test-session'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:response.status,...await response.json()};
  };
  return {sqlite,request};
}
const grade=(result='PASS',score=90)=>({score,result,confidence:0.95,criteria:[{name:'필수요소',score,max_score:100,evidence:'프롬프트와 수정 근거 확인'}],strengths:[],weaknesses:[],required_improvements:[],feedback:'프롬프트를 검토했습니다.'});
const aiResponse=value=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('a high-scoring model RETRY remains RETRY and feedback matches effective result',async t=>{
  const {sqlite,request}=await setup({migrated:false});t.after(()=>sqlite.close());
  sqlite.prepare('UPDATE assignments SET is_required=0 WHERE id=?').run('assignment-2');
  sqlite.prepare('INSERT INTO assignments(id,week_id,title,description,instructions,required_submission_types) VALUES(?,?,?,?,?,?)').run(tasks[0],2,'리서치 프롬프트','과제','필수요소','["TEXT"]');
  sqlite.prepare('INSERT INTO assignment_rubrics(id,assignment_id,name,description,max_score) VALUES(?,?,?,?,?)').run('test-rubric',tasks[0],'필수요소','확인',100);
  t.mock.method(globalThis,'fetch',async()=>aiResponse(grade('RETRY',90)));
  const result=await request(`/api/assignments/${tasks[0]}/submissions`,{text_content:'필수 출처 규칙이 누락된 프롬프트'});
  assert.equal(result.data.status,'RETRY');
  const evaluation=sqlite.prepare('SELECT * FROM evaluations WHERE submission_id<>?').get('old-pass');
  assert.equal(evaluation.result,'RETRY');assert.equal(evaluation.score,90);assert.equal(JSON.parse(evaluation.feedback_json).result,'RETRY');
  assert.equal((await request('/api/weeks')).data.progress[2].status,'LOCKED');
});
test('Week2 migration adds two TEXT-only required tasks and preserves history and custom data',()=>{
  const sqlite=database(false);
  sqlite.exec("INSERT INTO resources(id,week_id,title,resource_type) VALUES('custom-material',2,'관리자 자료','TEXT'); INSERT INTO lessons(id,week_id,title,body) VALUES('custom-lesson',2,'관리자 수업','유지'); INSERT INTO user_week_progress(user_id,week_id,status) VALUES('learner',3,'AVAILABLE');");
  const oldWeek3=sqlite.prepare('SELECT * FROM weeks WHERE id=3').get();
  sqlite.exec(migration('0005_week2_prompt_practice.sql'));
  assert.equal(sqlite.prepare('SELECT title FROM weeks WHERE id=2').get().title,'프롬프트 작성법: Deep Research와 이미지 생성');
  assert.deepEqual(sqlite.prepare('SELECT id FROM assignments WHERE week_id=2 AND is_required=1 ORDER BY id').all().map(x=>x.id),[tasks[1],tasks[0]]);
  assert.equal(sqlite.prepare("SELECT is_required FROM assignments WHERE id='assignment-2'").get().is_required,0);
  assert.match(sqlite.prepare("SELECT title FROM assignments WHERE id='assignment-2'").get().title,/^\[이전 교육과정\]/);
  assert.equal(sqlite.prepare("SELECT status FROM submissions WHERE id='old-pass'").get().status,'PASS');assert.equal(sqlite.prepare("SELECT score FROM evaluations WHERE id='old-evaluation'").get().score,90);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM assignment_rubrics WHERE assignment_id='assignment-2'").get().n,3);
  assert.equal(sqlite.prepare("SELECT title FROM resources WHERE id='custom-material'").get().title,'관리자 자료');assert.equal(sqlite.prepare("SELECT body FROM lessons WHERE id='custom-lesson'").get().body,'유지');
  assert.equal(sqlite.prepare('SELECT status FROM user_week_progress WHERE week_id=3').get().status,'AVAILABLE');assert.deepEqual(sqlite.prepare('SELECT * FROM weeks WHERE id=3').get(),oldWeek3);
  for(const id of tasks){const a=sqlite.prepare('SELECT * FROM assignments WHERE id=?').get(id);assert.equal(a.evaluation_mode,'AI');assert.equal(a.pass_score,80);assert.equal(a.max_attempts,0);assert.deepEqual(JSON.parse(a.required_submission_types),['TEXT']);assert.equal(a.is_advisory,0);assert.equal(sqlite.prepare('SELECT SUM(max_score) n FROM assignment_rubrics WHERE assignment_id=?').get(id).n,100);}
  sqlite.close();
});
test('old PASS cannot count for new tasks; first PASS locks week3 and second opens it',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());
  t.mock.method(globalThis,'fetch',async()=>aiResponse(grade()));
  assert.equal((await request('/api/weeks')).data.progress[2].status,'LOCKED');
  const first=await request(`/api/assignments/${tasks[0]}/submissions`,{text_content:'원본 프롬프트, 수정 프롬프트, 필수요소 점검표와 수정 이유'});assert.equal(first.data.status,'PASS');
  assert.equal((await request('/api/weeks')).data.progress[2].status,'LOCKED');
  const second=await request(`/api/assignments/${tasks[1]}/submissions`,{text_content:'원본 프롬프트, 수정 프롬프트, 필수요소 점검표와 수정 이유'});assert.equal(second.data.status,'PASS');
  const progress=(await request('/api/weeks')).data.progress;assert.equal(progress[1].status,'PASS');assert.equal(progress[2].status,'AVAILABLE');
});
test('Week2 only accepts prompt TEXT, not paid output evidence, and design.md stays optional',async t=>{
  const {sqlite,request}=await setup();t.after(()=>sqlite.close());let calls=0;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;const input=JSON.parse(JSON.parse(options.body).input);assert.match(input.additional_instruction,/design\.md/);assert.match(input.additional_instruction,/PASS/);return aiResponse({...grade(),feedback:'선택 권장: design.md의 팔레트·타이포그래피·간격·구도 제약을 참고하면 좋습니다.'});});
  assert.equal((await request(`/api/assignments/${tasks[1]}/submissions`,{submitted_url:'https://example.test/image.png'})).status,400);assert.equal(calls,0);
  const result=await request(`/api/assignments/${tasks[1]}/submissions`,{text_content:'원본과 수정 프롬프트, 점검표, 수정 이유. design.md와 생성 이미지는 제출하지 않았습니다.'});assert.equal(result.data.status,'PASS');assert.equal(calls,1);
  const evaluation=sqlite.prepare('SELECT feedback_json FROM evaluations WHERE submission_id=?').get(result.data.id);assert.match(JSON.parse(evaluation.feedback_json).feedback,/design\.md/);
  const a=sqlite.prepare('SELECT * FROM assignments WHERE id=?').get(tasks[1]);assert.match(a.ai_prompt,/항상/);assert.match(a.ai_prompt,/감점/);assert.match(a.instructions,/선택/);
});
