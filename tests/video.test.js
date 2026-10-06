import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeEmbed,youtubeSource} from '../public/js/video-url.js';

test('YouTube embeds accept official URL forms and reject lookalike hosts and invalid IDs',()=>{
  for(const url of ['https://youtu.be/dQw4w9WgXcQ','https://www.youtu.be/dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://m.youtube.com/shorts/dQw4w9WgXcQ','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'])
    assert.equal(youtubeEmbed(url),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  for(const url of ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://evil-youtu.be/dQw4w9WgXcQ','javascript:alert(1)','https://youtu.be/short','https://youtube.com/user/dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ/extra'])
    assert.equal(youtubeEmbed(url),null);
});

test('YouTube timestamps preserve only validated start seconds',()=>{
  const base='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  for(const query of ['t=271s','t=271','t=4m31s','start=271','start=271&t=50&autoplay=1'])
    assert.equal(youtubeEmbed(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&${query}`),`${base}?start=271`);
  assert.equal(youtubeEmbed('https://www.youtu.be/dQw4w9WgXcQ?t=24h'),`${base}?start=86400`);
  for(const query of ['t=','t=-1','t=1.5','t=271s<script>','t=9007199254740992','t=86401','t=24h1s','start=garbage&t=271','autoplay=1','t=0'])
    assert.equal(youtubeEmbed(`https://youtu.be/dQw4w9WgXcQ?${query}`),base);
});

test('fallback links accept trusted original URLs without requiring an embeddable video ID',()=>{
  assert.equal(youtubeSource('https://www.youtube.com/watch?bad=legacy'),'https://www.youtube.com/watch?bad=legacy');
  for(const url of ['https://youtube.com.evil.test/watch?bad=legacy','javascript:alert(1)','https://evil-youtu.be/short','https://user@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:8080/watch?v=dQw4w9WgXcQ'])
    assert.equal(youtubeSource(url),null);
});
