import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const env={ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname)}};
const get=path=>worker.fetch(new Request(`https://example.test${path}`),env);

test('public landing and login map to static assets without a build',async()=>{
  assert.equal(await (await get('/')).text(),'/index.html');
  assert.equal(await (await get('/login')).text(),'/login.html');
});
test('private pages and APIs require a session',async()=>{
  for(const path of ['/admin','/admin.html','/dashboard','/week','/assignment'])assert.equal((await get(path)).status,302);
  assert.equal((await get('/api/weeks')).status,401);
});
test('cross-origin mutations are rejected before any database access',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/admin/users/bulk-approve',{method:'POST',headers:{Origin:'https://evil.test'}}),env);
  assert.equal(response.status,403);
  assert.equal((await response.json()).error.code,'CSRF');
});
test('OAuth requires private configuration',async()=>{
  const response=await get('/auth/google');
  assert.equal(response.status,503);
});
test('login status safely reports missing Google setup',async()=>{
  const response=await get('/api/auth/status');
  assert.deepEqual(await response.json(),{ok:true,data:{googleConfigured:false,adminConfigured:false,signedIn:false,role:null,status:null}});
});
test('Google OAuth verifies state, creates approved super-admin and secure session',async()=>{
  const stateStore=new Map(),users=new Map(),sessions=[];
  const mockDb={prepare(sql){let args=[];return {bind(...values){args=values;return this},async run(){
    if(sql.startsWith('INSERT INTO oauth_states'))stateStore.set(args[0],{state_hash:args[0],verifier:args[1],expires_at:args[2]});
    else if(sql.startsWith('DELETE FROM oauth_states'))stateStore.delete(args[0]);
    else if(sql.startsWith('INSERT INTO users'))users.set(args[1],{id:args[0],google_sub:args[1],email:args[2],name:args[3],role:args[4],status:args[5]});
    else if(sql.startsWith('UPDATE users SET name=')){const user=[...users.values()].find(u=>u.id===args[3]);Object.assign(user,{name:args[0],email:args[1]});}
    else if(sql.startsWith('INSERT INTO sessions'))sessions.push(args);
    return {success:true};},async first(){
      if(sql.startsWith('SELECT * FROM oauth_states'))return stateStore.get(args[0])||null;
      if(sql.startsWith('SELECT * FROM users WHERE google_sub='))return users.get(args[0])||null;
      if(sql.startsWith('SELECT * FROM users WHERE id='))return [...users.values()].find(u=>u.id===args[0])||null;
      return null;}}}};
  const authEnv={...env,DB:mockDb,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',SUPER_ADMIN_EMAIL:'admin@example.test'};
  const start=await worker.fetch(new Request('https://example.test/auth/google'),authEnv);
  assert.equal(start.status,302);
  const target=new URL(start.headers.get('location'));
  assert.equal(target.hostname,'accounts.google.com');
  assert.equal(target.searchParams.get('redirect_uri'),'https://example.test/auth/callback');
  assert.equal(target.searchParams.get('code_challenge_method'),'S256');
  const state=target.searchParams.get('state');
  assert.match(start.headers.get('set-cookie'),/oauth_state=.*HttpOnly; Secure; SameSite=Lax/);
  const rejected=await worker.fetch(new Request(`https://example.test/auth/callback?state=${state}&code=fake`,{headers:{Cookie:'oauth_state=wrong'}}),authEnv);
  assert.equal(rejected.status,403);
  const originalFetch=globalThis.fetch;
  let identity={sub:'google-admin-sub',email:'admin@example.test',name:'관리자',email_verified:true};
  globalThis.fetch=async url=>Response.json(url.includes('/token')?{access_token:'mock-google-token'}:identity);
  try{
    const result=await worker.fetch(new Request(`https://example.test/auth/callback?state=${state}&code=fake`,{headers:{Cookie:`oauth_state=${state}`}}),authEnv);
    assert.equal(result.status,302);
    assert.equal(result.headers.get('location'),'/admin');
    const cookies=result.headers.getSetCookie();
    assert.equal(cookies.length,2);
    assert.match(cookies[0],/sid=.*HttpOnly; Secure; SameSite=Lax/);
    assert.equal(users.get('google-admin-sub').role,'ADMIN');
    assert.equal(users.get('google-admin-sub').status,'APPROVED');
    assert.equal(sessions.length,1);
    identity={sub:'google-learner-sub',email:'learner@example.test',name:'일반 사용자',email_verified:true};
    const nextStart=await worker.fetch(new Request('https://example.test/auth/google'),authEnv);
    const nextState=new URL(nextStart.headers.get('location')).searchParams.get('state');
    const learner=await worker.fetch(new Request(`https://example.test/auth/callback?state=${nextState}&code=fake`,{headers:{Cookie:`oauth_state=${nextState}`}}),authEnv);
    assert.equal(learner.status,302);
    assert.equal(learner.headers.get('location'),'/dashboard');
    assert.equal(users.get('google-learner-sub').role,'USER');
    assert.equal(users.get('google-learner-sub').status,'PENDING');
    assert.equal(sessions.length,2);
  }finally{globalThis.fetch=originalFetch;}
});
test('public theme follows administrator setting and rejects non-admin changes',async()=>{
  let theme='CONSTRUCTION';
  const db={prepare(sql){let params=[];return {bind(...values){params=values;return this},async first(){
    if(sql.includes('FROM sessions s JOIN users u'))return {id:'admin-1',role:'ADMIN',status:'APPROVED'};
    if(sql.includes('FROM app_settings'))return {value:theme};
    return null;
  },async run(){if(sql.startsWith('INSERT INTO app_settings'))theme=params[1];return {success:true}}}}};
  const themeEnv={...env,DB:db};
  assert.deepEqual((await (await worker.fetch(new Request('https://example.test/api/theme'),themeEnv)).json()).data,{theme:'CONSTRUCTION'});
  const path='https://example.test/api/admin/settings/theme';
  const headers={Origin:'https://example.test','Content-Type':'application/json'};
  assert.equal((await worker.fetch(new Request(path,{method:'PUT',headers,body:JSON.stringify({theme:'ORIGINAL'})}),themeEnv)).status,401);
  const adminHeaders={...headers,Cookie:'sid=test-admin-session'};
  assert.equal((await worker.fetch(new Request(path,{method:'PUT',headers:adminHeaders,body:JSON.stringify({theme:'UNSAFE'})}),themeEnv)).status,400);
  const saved=await worker.fetch(new Request(path,{method:'PUT',headers:adminHeaders,body:JSON.stringify({theme:'ORIGINAL'})}),themeEnv);
  assert.equal(saved.status,200);
  assert.equal(theme,'ORIGINAL');
  assert.deepEqual((await (await worker.fetch(new Request('https://example.test/api/theme'),themeEnv)).json()).data,{theme:'ORIGINAL'});
});
test('curriculum and schema cover twelve weeks and core tables',()=>{
  const seed=readFileSync(new URL('../migrations/0002_seed.sql',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
  for(let i=1;i<=12;i++)assert.match(seed,new RegExp(`\\(${i},`));
  for(const table of ['users','sessions','weeks','lessons','resources','assignments','assignment_rubrics','submissions','submission_files','evaluations','user_week_progress','app_settings','audit_logs'])assert.match(schema,new RegExp(`CREATE TABLE ${table} \\(`));
});
