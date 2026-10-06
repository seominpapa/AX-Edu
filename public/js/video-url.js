export function youtubeSource(url){
  try{
    const u=new URL(url);
    return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&['youtu.be','www.youtu.be','youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname)?u.href:null;
  }catch{return null}
}

export function youtubeEmbed(url){
  const source=youtubeSource(url);if(!source)return null;
  const u=new URL(source);
  const id=['youtu.be','www.youtu.be'].includes(u.hostname)?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):/^\/(?:embed|shorts|live)\/([^/]+)$/.exec(u.pathname)?.[1];
  if(!/^[\w-]{11}$/.test(id||''))return null;
  const raw=u.searchParams.get('start')??u.searchParams.get('t')??'';
  const parts=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  const seconds=/^\d+$/.test(raw)?Number(raw):parts?Number(parts[1]||0)*3600+Number(parts[2]||0)*60+Number(parts[3]||0):NaN;
  const start=Number.isSafeInteger(seconds)&&seconds>0&&seconds<=86400?`?start=${seconds}`:'';
  return `https://www.youtube-nocookie.com/embed/${id}${start}`;
}
