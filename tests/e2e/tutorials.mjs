import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tracks } from '../../public/js/tutorial-data.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL('/tutorials', process.env.TUTORIAL_BASE_URL || 'http://127.0.0.1:3000');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
const visible = locator => locator.waitFor({ state: 'visible' });
const trackControl = name => page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first();
const completeButton = () => page.getByRole('button', { name: '학습 완료로 표시', exact: true });
const undoButton = () => page.getByRole('button', { name: '완료 표시 해제', exact: true });
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${(await page.viewportSize()).width}px`);

try {
  await page.goto(new URL('/', base).href);
  const toolkit = page.getByRole('region', { name: '세 가지 도구, 하나의 목표', exact: true });
  await visible(toolkit);
  assert.equal(await page.locator('.site-header a[href="/tutorials"]').count(), 0, 'Tutorials do not add a main menu item');
  const guide = toolkit.getByRole('navigation', { name: '도구 사용법', exact: true });
  await visible(guide);
  assert.deepEqual(await guide.getByRole('link').allTextContents(), ['Codex 사용법↗', 'Claude Code 사용법↗', 'Antigravity 사용법↗']);
  await page.evaluate(() => localStorage.setItem('ax-edu-tutorials-v1', JSON.stringify({ claude: ['setup'], codex: [] })));
  const copyBox = await toolkit.locator('.toolkit-copy').boundingBox();
  const guideBox = await guide.boundingBox();
  assert.ok(guideBox.x >= copyBox.x + copyBox.width, 'Usage links sit to the right of the tool introduction');
  for (const [name, track] of [['Codex 사용법', 'codex'], ['Claude Code 사용법', 'claude'], ['Antigravity 사용법', 'antigravity']]) {
    await toolkit.getByRole('link', { name, exact: true }).click();
    await page.waitForURL(url => url.pathname === '/tutorials' && url.hash === `#${track}/setup`);
    await visible(page.getByRole('heading', { name: tracks[track].lessons[0].title, exact: true }));
    await page.goto(new URL('/', base).href);
  }
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow();
    const copy = await toolkit.locator('.toolkit-copy').boundingBox();
    const usage = await guide.boundingBox();
    assert.ok(usage.y >= copy.y + copy.height, 'Usage links stack below the introduction on mobile');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.goto(`${base.href}#codex/workflow`);
  assert.equal(response.status(), 200);
  await visible(page.getByRole('heading', { level: 1, name: '코딩 에이전트, 내 업무에 직접 써보기', exact: true }));
  assert.deepEqual(await page.locator('#track-switch button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Codex', 'Claude Code', 'Antigravity']);
  await visible(page.getByRole('heading', { name: tracks.codex.lessons.find(lesson => lesson.id === 'workflow').title, exact: true }));
  await page.reload();
  await visible(completeButton());
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '실습 본문으로 건너뛰기');
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#codex/workflow', 'Skip link preserves the selected tutorial');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'lesson-content', 'Skip link moves keyboard focus into the lesson');
  await visible(completeButton());
  await completeButton().click();
  await visible(undoButton());
  await page.reload();
  await visible(undoButton());
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ax-edu-tutorials-v1')).codex), ['workflow']);

  await trackControl('Claude Code').click();
  await page.waitForURL(url => url.hash === '#claude/workflow');
  await visible(completeButton());
  await trackControl('Codex').click();
  await page.waitForURL(url => url.hash === '#codex/workflow');
  await visible(undoButton());
  await undoButton().click();
  await visible(completeButton());

  await trackControl('Antigravity').click();
  await page.waitForURL(url => url.hash === '#antigravity/workflow');
  await completeButton().click();
  await page.reload();
  await visible(undoButton());
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ax-edu-tutorials-v1'))), { codex: [], claude: ['setup'], antigravity: ['workflow'] });
  await trackControl('Codex').click();
  await page.waitForURL(url => url.hash === '#codex/workflow');
  await visible(completeButton());

  await page.getByRole('button', { name: '실습 프롬프트 복사', exact: true }).click();
  await visible(page.getByText('복사했습니다.', { exact: true }));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, tracks.codex.lessons.find(lesson => lesson.id === 'workflow').exercise.prompt);

  for (const [name, filename] of [['회의 메모 다운로드', 'meetings.md'], ['조치사항 CSV 다운로드', 'actions.csv']]) {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('link', { name, exact: true }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), filename);
    const content = await readFile(await download.path(), 'utf8');
    assert.match(content, /가설통로/);
    assert.match(content, /2026-11-17/);
    assert.doesNotMatch(content, /KAERI|원자력연구원|코난쌤/i);
  }

  for (const [trackId, track] of Object.entries(tracks)) {
    await trackControl(track.name).click();
    for (const lesson of track.lessons) {
      await page.locator(`[data-lesson="${lesson.id}"]`).click();
      await page.waitForURL(url => url.hash === `#${trackId}/${lesson.id}`);
      await visible(page.getByRole('heading', { name: lesson.title, exact: true }));
      assert.doesNotMatch(await page.locator('body').innerText(), /KAERI|원자력연구원|코난쌤|한준구/i);
      await noOverflow();
    }
    const ids = Object.keys(tracks);
    const nextTrack = ids[(ids.indexOf(trackId) + 1) % ids.length];
    assert.equal(await page.getByRole('link', { name: '다른 도구로 시작하기 →', exact: true }).getAttribute('href'), `#${nextTrack}/setup`);
  }

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base.href}#codex/workflow`);
    await visible(page.getByRole('heading', { name: tracks.codex.lessons.find(lesson => lesson.id === 'workflow').title, exact: true }));
    await noOverflow();
    for (const [id, track] of Object.entries(tracks)) {
      await trackControl(track.name).click();
      await page.waitForURL(url => url.hash === `#${id}/workflow`);
      await noOverflow();
    }
  }

  await page.goto(`${base.href}#codex/not-a-lesson`);
  await visible(page.getByRole('heading', { name: tracks.codex.lessons[0].title, exact: true }));
  await page.goto(`${base.href}#unknown/invalid`);
  await visible(page.getByRole('heading', { name: tracks.codex.lessons[0].title, exact: true }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: '첫 실습 시작하기', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#codex/setup', 'Start CTA keeps the selected first lesson');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'lesson-content', 'Start CTA focuses the lesson even when its route is already selected');
  const lessonTop = await page.locator('#lesson-content').evaluate(node => node.getBoundingClientRect().top);
  assert.ok(lessonTop >= 0 && lessonTop < 300, 'Start CTA brings the lesson below the sticky header');
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY', 'Keyboard navigation reaches an interactive control');

  const blockedContext = await browser.newContext();
  try {
    await blockedContext.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    });
    await blockedContext.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    const blockedPage = await blockedContext.newPage();
    blockedPage.on('pageerror', error => errors.push(error.message));
    await blockedPage.goto(`${base.href}#codex/workflow`);
    await blockedPage.getByRole('button', { name: '학습 완료로 표시', exact: true }).click();
    await visible(blockedPage.getByText('진도를 저장할 수 없습니다.', { exact: false }));
    await visible(blockedPage.getByRole('button', { name: '완료 표시 해제', exact: true }));
    await blockedPage.reload();
    await visible(blockedPage.getByRole('button', { name: '학습 완료로 표시', exact: true }));
  } finally {
    await blockedContext.close();
  }
  assert.deepEqual(errors, [], 'Tutorial pages have no JavaScript runtime errors');
  console.log('PASS: ordered toolkit links and three tracks, 21 lessons, migrated and independent progress, deep links, clipboard, downloads, keyboard controls, storage failures and 1440/375/320px layouts');
} finally {
  await context.close();
  await browser.close();
}
