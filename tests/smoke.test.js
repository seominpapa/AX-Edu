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
test('curriculum and schema cover twelve weeks and core tables',()=>{
  const seed=readFileSync(new URL('../migrations/0002_seed.sql',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
  for(let i=1;i<=12;i++)assert.match(seed,new RegExp(`\\(${i},`));
  for(const table of ['users','sessions','weeks','lessons','resources','assignments','assignment_rubrics','submissions','submission_files','evaluations','user_week_progress','app_settings','audit_logs'])assert.match(schema,new RegExp(`CREATE TABLE ${table} \\(`));
});
