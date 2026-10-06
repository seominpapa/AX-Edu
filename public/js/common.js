export const $=(selector,root=document)=>root.querySelector(selector);
export const el=(tag,attrs={},children=[])=>{const node=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')node.className=v;else if(k==='text')node.textContent=v??'';else if(k==='onClick')node.addEventListener('click',v);else if(v!==null&&v!==undefined)node.setAttribute(k,String(v));}for(const child of children)node.append(child instanceof Node?child:document.createTextNode(String(child)));return node;};
export const clear=node=>node.replaceChildren();
export const text=(selector,value)=>{$(selector).textContent=value??''};
export const toolNames={GENERAL:'일반',CHATGPT_CODEX:'ChatGPT / Codex',CLAUDE_CODE:'Claude Code',GEMINI_ANTIGRAVITY:'Gemini / Antigravity'};
export const states={LOCKED:'잠금',AVAILABLE:'시작 가능',IN_PROGRESS:'진행 중',SUBMITTED:'제출 완료',AI_REVIEW:'AI 평가 중',HUMAN_REVIEW:'관리자 검수 중',RETRY:'재도전',PASS:'PASS',ADVICE_PENDING:'AI 안내 중',ADVICE_ERROR:'AI 안내 오류',COMPLETED:'학습 완료'};
export const pill=(state)=>el('span',{class:'pill '+(state==='RETRY'||state==='HUMAN_REVIEW'?'warn':state==='LOCKED'?'neutral':''),text:states[state]||state});
export const badge=(label)=>el('span',{class:'tag',text:label});
export const link=(href,label,external=false)=>el('a',{href,class:'link',...(external?{target:'_blank',rel:'noopener noreferrer'}:{}),text:label});
export async function request(path,options={}){const response=await fetch(path,{credentials:'same-origin',...options});let result;try{result=await response.json()}catch{throw Error('서버 응답을 읽을 수 없습니다.')}if(!result.ok)throw Error(result.error?.message||'요청에 실패했습니다.');return result.data;}
export const send=(path,data,method='POST')=>request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
export function alertError(e){window.alert(e.message||String(e));}
export const date=s=>s?new Date(s.replace(' ','T')+'Z').toLocaleDateString('ko-KR'):'-';
export async function getMe(){try{return await request('/api/me')}catch{location.href='/login';return null}}
export function nav(active=''){const nav=$('#main-nav');if(!nav)return;const items=[['/dashboard','홈'],['/dashboard#weeks','12주 과정'],['/dashboard#submissions','내 제출물'],['/dashboard#guides','도구 사용법'],['/dashboard#profile','내 정보']];for(const [href,label] of items)nav.append(el('a',{href,class:active===label?'active':'',text:label}));nav.append(el('button',{text:'로그아웃',onClick:async()=>{await send('/auth/logout',{});location.href='/login'}}));}
export function adminNav(active=''){const nav=$('#admin-nav');if(!nav)return;for(const [key,label] of [['overview','Dashboard'],['users','사용자'],['weeks','12주 과정'],['resources','콘텐츠'],['assignments','과제'],['reviews','검수'],['ai','AI 설정'],['system','시스템']])nav.append(el('button',{type:'button','data-tab':key,class:key===active?'active':'',text:label}));}
export function formValue(form){return Object.fromEntries(new FormData(form).entries());}
export function field(label,value='',tag='input',attrs={}){const wrap=el('div',{class:'form-row'}),id='field-'+crypto.randomUUID();wrap.append(el('label',{for:id,text:label}));const control=el(tag,{id,...attrs});control.value=value??'';wrap.append(control);return {wrap,control};}
export function fmtFeedback(raw){try{return typeof raw==='string'?JSON.parse(raw):raw||{}}catch{return {feedback:'평가 데이터를 표시할 수 없습니다.'}}}
