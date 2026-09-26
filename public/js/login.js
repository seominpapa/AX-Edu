import {request,$} from './common.js';
const message=$('#login-status');
const errors={google_cancelled:'Google 로그인이 취소되었습니다. 다시 시도해 주세요.',not_configured:'Google 로그인 설정이 아직 완료되지 않았습니다. 운영자에게 문의해 주세요.'};
const query=new URLSearchParams(location.search);
if(query.has('error')){message.hidden=false;message.textContent=errors[query.get('error')]||'로그인 중 문제가 발생했습니다. 다시 시도해 주세요.';}
try{
  const status=await request('/api/auth/status');
  if(status.signedIn){location.replace(status.role==='ADMIN'?'/admin':'/dashboard');}
  else if(!status.googleConfigured){message.hidden=false;message.textContent='Google 로그인을 준비 중입니다. 운영자가 Google OAuth Client ID와 Secret을 Cloudflare Worker에 설정해야 합니다.';document.querySelectorAll('.google-login').forEach(a=>{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.style.opacity='.55';a.addEventListener('click',e=>e.preventDefault());});}
}catch{message.hidden=false;message.textContent='로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.';}
