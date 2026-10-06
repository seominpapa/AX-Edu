import {el,link} from './common.js';

import {youtubeEmbed,youtubeSource} from './video-url.js';
export {youtubeEmbed} from './video-url.js';

export function openVideo(resource,trigger){
  const titleId='video-'+crypto.randomUUID(),embed=youtubeEmbed(resource.url),source=youtubeSource(resource.url);
  const dialog=el('dialog',{class:'video-dialog','aria-labelledby':titleId});
  const close=el('button',{class:'btn secondary small',type:'button',text:'닫기',autofocus:'',onClick:()=>dialog.close()});
  dialog.append(el('div',{class:'flex between'},[el('h2',{id:titleId,text:resource.title}),close]));
  let player;
  if(resource.resource_type==='YOUTUBE'){
    dialog.append(el('p',{class:'tiny',text:resource.source?`출처 / 채널: ${resource.source}`:'채널 정보는 YouTube 원본에서 확인하세요.'}));
    if(embed){player=el('iframe',{src:embed,title:resource.title,allow:'encrypted-media; picture-in-picture',allowfullscreen:'',referrerpolicy:'strict-origin-when-cross-origin'});dialog.append(player)}
    dialog.append(el('p',{class:'tiny',text:source?'재생할 수 없는 영상은 YouTube에서 직접 시청해 주세요.':'교육영상 링크를 확인할 수 없습니다. 관리자에게 문의해 주세요.'}));
    if(source)dialog.append(link(source,'YouTube 원본 보기 ↗',true));
  }else{
    player=el('video',{src:`/api/files/${resource.file_id}`,controls:'',preload:'metadata'});dialog.append(player);
  }
  dialog.addEventListener('close',()=>{
    if(player?.tagName==='VIDEO'){player.pause();player.removeAttribute('src');player.load()}
    else if(player)player.src='about:blank';
    dialog.remove();trigger?.focus();
  },{once:true});
  document.body.append(dialog);dialog.showModal();
}
