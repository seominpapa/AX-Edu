import { $, el, clear } from './common.js';
import { tracks, lessonIds, lessonLabels, verifiedAt } from './tutorial-data.js';
import { resolveTutorial, readProgress, toggleComplete, writeProgress } from './tutorial-state.js';

let storage;
try { storage = window.localStorage; } catch { storage = null; }
let progress = readProgress(storage);
let state = resolveTutorial(location.hash);
let statusTimer;

function announce(message) {
  clearTimeout(statusTimer);
  $('#tutorial-status').textContent = message;
  statusTimer = setTimeout(() => { $('#tutorial-status').textContent = ''; }, 6000);
}

function codeBlock(text, label, copyLabel) {
  const button = el('button', { type: 'button', class: 'tutorial-copy', 'aria-label': copyLabel, text: '복사' });
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      announce('복사했습니다.');
    } catch {
      announce('자동 복사가 되지 않았습니다. 아래 내용을 직접 선택해 복사해 주세요.');
    }
  });
  return el('div', { class: 'lesson-code' }, [
    el('div', { class: 'lesson-code-head' }, [el('span', { text: label }), button]),
    el('pre', {}, [el('code', { text })])
  ]);
}

function renderNavigation() {
  const switcher = $('#track-switch');
  clear(switcher);
  for (const [id, track] of Object.entries(tracks)) {
    const button = el('button', {
      type: 'button', class: `tutorial-track${state.track === id ? ' active' : ''}`,
      'aria-label': track.name, 'aria-pressed': state.track === id ? 'true' : 'false',
      onClick: () => { location.hash = `${id}/${state.lesson}`; }
    }, [
      el('span', { class: 'tutorial-tool-mark', 'aria-hidden': 'true', text: id === 'claude' ? 'C' : '>_' }),
      el('span', { class: 'tutorial-track-copy' }, [el('strong', { text: track.name }), el('small', { text: track.description })]),
      el('span', { class: 'tutorial-track-count', text: `${progress[id].length} / 7 완료` })
    ]);
    switcher.append(button);
  }
  const nav = $('#lesson-nav');
  clear(nav);
  lessonIds.forEach((id, index) => {
    const completed = progress[state.track].includes(id);
    nav.append(el('a', {
      href: `#${state.track}/${id}`, 'data-lesson': id,
      class: `tutorial-lesson-link${state.lesson === id ? ' active' : ''}`,
      'aria-current': state.lesson === id ? 'step' : null
    }, [el('span', { class: 'tutorial-lesson-number', text: String(index + 1).padStart(2, '0') }),
      el('span', { class: 'tutorial-lesson-label', text: lessonLabels[index] }),
      ...(completed ? [el('span', { class: 'tutorial-done-mark', 'aria-label': '학습 완료', text: '✓' })] : [])]));
  });
  $('#progress-count').textContent = `${progress[state.track].length} / 7 완료`;
  $('#tutorial-progress').value = progress[state.track].length;
  $('#start-tutorial').href = `#${state.track}/setup`;
}

function renderSections(lesson, body) {
  lesson.sections.forEach((section, index) => {
    const node = el('section', { class: 'lesson-section' }, [el('h3', { text: section.title }), el('p', { text: section.body })]);
    if (section.items) node.append(el('ul', {}, section.items.map(text => el('li', { text }))));
    if (section.code) node.append(codeBlock(section.code, section.label || '참고 예시', `${section.title} 복사`));
    node.dataset.section = index;
    body.append(node);
  });
}

function renderExercise(lesson, body) {
  const exercise = lesson.exercise;
  const node = el('section', { class: 'lesson-exercise' }, [
    el('p', { class: 'eyebrow', text: 'YOUR TURN / 직접 해보기' }),
    el('h3', { text: exercise.title }),
    el('ol', {}, exercise.steps.map(text => el('li', { text }))),
    codeBlock(exercise.prompt, `${tracks[state.track].name}에 입력할 실습 프롬프트`, '실습 프롬프트 복사'),
    el('div', { class: 'lesson-deliverable' }, [el('strong', { text: '이번 실습의 결과물' }), el('p', { text: exercise.deliverable })])
  ]);
  const checks = el('div', { class: 'lesson-checks' }, [el('h4', { text: '이렇게 확인해 보세요' })]);
  exercise.checks.forEach(text => checks.append(el('label', {}, [el('input', { type: 'checkbox' }), el('span', { text })])));
  const completed = progress[state.track].includes(state.lesson);
  const button = el('button', { type: 'button', class: `btn ${completed ? 'secondary' : ''}`, 'aria-pressed': String(completed), text: completed ? '완료 표시 해제' : '학습 완료로 표시' });
  button.addEventListener('click', () => {
    progress = toggleComplete(progress, state.track, state.lesson);
    const saved = writeProgress(storage, progress);
    renderNavigation();
    const done = progress[state.track].includes(state.lesson);
    button.textContent = done ? '완료 표시 해제' : '학습 완료로 표시';
    button.setAttribute('aria-pressed', String(done));
    button.classList.toggle('secondary', done);
    announce(saved ? (done ? '이 브라우저에 학습 완료를 저장했습니다.' : '완료 표시를 해제했습니다.') : '진도를 저장할 수 없습니다. 현재 화면에서는 표시되지만 새로고침하면 사라집니다.');
  });
  node.append(checks, el('div', { class: 'lesson-completion' }, [button, el('p', { class: 'lesson-completion-note', text: '체크리스트는 직접 확인하는 연습용입니다. 자동 채점이나 12주 과정 PASS로 처리되지 않습니다.' })]));
  body.append(node);
}

function renderLesson() {
  const track = tracks[state.track];
  const index = lessonIds.indexOf(state.lesson);
  const lesson = track.lessons[index];
  const root = $('#lesson-content');
  clear(root);
  const heading = el('header', { class: 'lesson-heading' }, [
    el('div', { class: 'lesson-heading-meta' }, [el('p', { class: 'eyebrow', text: `${track.name} / STEP ${String(index + 1).padStart(2, '0')}` }), el('span', { text: `예상 실습 ${lesson.minutes}분 · 개인별 차이 있음` })]),
    el('h2', { text: lesson.title }), el('p', { text: lesson.summary })
  ]);
  const body = el('div', { class: 'lesson-body' }, [el('section', { class: 'lesson-goals' }, [el('h3', { text: '이 실습을 마치면' }), el('ul', {}, lesson.goals.map(text => el('li', { text })))])]);
  renderSections(lesson, body);
  renderExercise(lesson, body);
  body.append(el('details', { class: 'lesson-sources' }, [
    el('summary', { text: `참고한 공식 문서 · ${verifiedAt} 확인` }),
    el('ul', {}, lesson.sources.map(source => el('li', {}, [el('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', text: `${source.label} ↗` })])))
  ]));
  const pager = el('nav', { class: 'lesson-pager', 'aria-label': '이전 다음 실습' });
  if (index > 0) pager.append(el('a', { href: `#${state.track}/${lessonIds[index - 1]}`, text: `← ${lessonLabels[index - 1]}` }));
  if (index < lessonIds.length - 1) pager.append(el('a', { href: `#${state.track}/${lessonIds[index + 1]}`, text: `${lessonLabels[index + 1]} →` }));
  else pager.append(el('a', { href: `#${state.track === 'claude' ? 'codex' : 'claude'}/setup`, text: '다른 도구로 시작하기 →' }));
  body.append(pager);
  root.append(heading, body);
  document.title = `${lessonLabels[index]} · ${track.name} 실습 · 건설인 AI Native`;
}

function render() {
  state = resolveTutorial(location.hash);
  const hash = `#${state.track}/${state.lesson}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  renderNavigation();
  renderLesson();
}

function focusLesson() {
  $('#lesson-content').focus({ preventScroll: true });
  $('#lesson-content').scrollIntoView({ block: 'start' });
}

$('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  focusLesson();
});
$('#start-tutorial').addEventListener('click', event => {
  if (new URL(event.currentTarget.href).hash === location.hash) {
    event.preventDefault();
    focusLesson();
  }
});

window.addEventListener('hashchange', () => {
  render();
  focusLesson();
});
render();
if (!storage) announce('브라우저 저장소를 사용할 수 없습니다. 실습은 가능하지만 진도는 저장되지 않습니다.');
