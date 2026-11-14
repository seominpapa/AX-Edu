import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const progressKey = 'ax-edu-tutorials-v1';
const emptyProgress = () => ({ claude: [], codex: [] });

test('tutorials are public routes and do not need a session or database', async () => {
  const env = { ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) } };
  for (const path of ['/tutorials', '/tutorials/', '/tutorials.html']) {
    const response = await worker.fetch(new Request(`https://example.test${path}`), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '/tutorials.html');
  }
});

test('both tracks cover the same seven lessons with practical exercises and official references', async () => {
  const { tracks, lessonIds } = await import('../public/js/tutorial-data.js');
  assert.deepEqual(lessonIds, ['setup', 'basics', 'workflow', 'extend', 'collaborate', 'security', 'recipes']);
  assert.deepEqual(Object.keys(tracks).sort(), ['claude', 'codex']);
  for (const [trackId, track] of Object.entries(tracks)) {
    assert.ok(track.name.trim());
    assert.deepEqual(track.lessons.map(lesson => lesson.id), lessonIds);
    for (const lesson of track.lessons) {
      const message = `${trackId}/${lesson.id}`;
      for (const field of ['title', 'summary']) assert.ok(lesson[field]?.trim(), `${message}: ${field}`);
      assert.ok(Number.isFinite(lesson.minutes) && lesson.minutes > 0, `${message}: duration`);
      assert.ok(lesson.goals.length > 0 && lesson.goals.every(value => value.trim()), `${message}: goals`);
      assert.ok(lesson.sections.length >= 2, `${message}: explanations`);
      for (const section of lesson.sections) {
        assert.ok(section.title.trim() && section.body.trim(), `${message}: section content`);
        if (section.items) assert.ok(section.items.every(value => value.trim()));
        if (section.code !== undefined) assert.ok(section.code.trim());
      }
      const exercise = lesson.exercise;
      for (const field of ['title', 'prompt', 'deliverable']) assert.ok(exercise[field]?.trim(), `${message}: exercise ${field}`);
      for (const field of ['steps', 'checks']) assert.ok(exercise[field].length > 0 && exercise[field].every(value => value.trim()), `${message}: exercise ${field}`);
      assert.ok(lesson.sources.length > 0, `${message}: references`);
      for (const source of lesson.sources) {
        assert.ok(source.label.trim(), `${message}: source label`);
        const url = new URL(source.url);
        assert.equal(url.protocol, 'https:');
        const official = trackId === 'claude'
          ? ['code.claude.com', 'docs.anthropic.com', 'claude.com', 'www.anthropic.com'].includes(url.hostname)
          : ['learn.chatgpt.com', 'developers.openai.com', 'help.openai.com', 'openai.com', 'platform.openai.com'].includes(url.hostname)
            || (url.hostname === 'github.com' && url.pathname.startsWith('/openai/'));
        assert.ok(official, `${message}: official source ${url.href}`);
      }
    }
    assert.doesNotMatch(JSON.stringify(track), /KAERI|원자력연구원|코난쌤|한준구/i);
  }
});

test('tutorial deep links select a valid track and recover from invalid fragments', async () => {
  const { resolveTutorial } = await import('../public/js/tutorial-state.js');
  assert.deepEqual(resolveTutorial('#codex/workflow'), { track: 'codex', lesson: 'workflow' });
  assert.deepEqual(resolveTutorial('#claude/security'), { track: 'claude', lesson: 'security' });
  assert.deepEqual(resolveTutorial('#codex/missing'), { track: 'codex', lesson: 'setup' });
  for (const hash of ['', '#', '#missing/nope', '#%E0%A4%A', '#<script>/bad']) {
    assert.deepEqual(resolveTutorial(hash), { track: 'claude', lesson: 'setup' });
  }
});

test('stored tutorial progress is filtered to known lessons and remains separate by track', async () => {
  const { readProgress } = await import('../public/js/tutorial-state.js');
  const storage = { getItem(key) {
    assert.equal(key, progressKey);
    return JSON.stringify({ claude: ['setup', 'setup', 'missing', 2], codex: ['workflow'], unknown: ['security'] });
  } };
  assert.deepEqual(readProgress(storage), { claude: ['setup'], codex: ['workflow'] });
});

test('missing, malformed and unavailable storage cannot prevent learning', async () => {
  const { readProgress } = await import('../public/js/tutorial-state.js');
  for (const value of [null, '{broken', 'null', '42', '[]', '"text"', '{"claude":true,"codex":{}}']) {
    assert.deepEqual(readProgress({ getItem: () => value }), emptyProgress());
  }
  assert.deepEqual(readProgress({ getItem() { throw new Error('Storage disabled'); } }), emptyProgress());
});

test('completion toggles without mutating previously loaded progress', async () => {
  const { toggleComplete } = await import('../public/js/tutorial-state.js');
  const original = Object.freeze({ claude: Object.freeze(['setup']), codex: Object.freeze([]) });
  const completed = toggleComplete(original, 'codex', 'workflow');
  assert.deepEqual(completed, { claude: ['setup'], codex: ['workflow'] });
  assert.deepEqual(original, { claude: ['setup'], codex: [] });
  assert.notEqual(completed, original);
  assert.deepEqual(toggleComplete(completed, 'codex', 'workflow'), { claude: ['setup'], codex: [] });
});

test('completion storage reports write failures instead of claiming success', async () => {
  const { writeProgress } = await import('../public/js/tutorial-state.js');
  const progress = { claude: ['setup'], codex: ['workflow'] };
  let saved;
  assert.equal(writeProgress({ setItem(key, value) {
    assert.equal(key, progressKey);
    saved = JSON.parse(value);
  } }, progress), true);
  assert.deepEqual(saved, progress);
  assert.equal(writeProgress({ setItem() { throw new Error('Quota exceeded'); } }, progress), false);
});
