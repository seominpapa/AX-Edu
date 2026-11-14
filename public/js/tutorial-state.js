import { lessonIds, tracks } from './tutorial-data.js';

const storageKey = 'ax-edu-tutorials-v1';
const emptyProgress = () => ({ claude: [], codex: [] });

export function resolveTutorial(hash) {
  const [track, lesson] = hash.replace(/^#/, '').split('/');
  return {
    track: Object.hasOwn(tracks, track) ? track : 'claude',
    lesson: lessonIds.includes(lesson) ? lesson : 'setup'
  };
}

export function readProgress(storage) {
  try {
    const value = JSON.parse(storage.getItem(storageKey));
    return Object.fromEntries(Object.keys(tracks).map(track => [track,
      Array.isArray(value?.[track]) ? [...new Set(value[track].filter(id => lessonIds.includes(id)))] : []
    ]));
  } catch {
    return emptyProgress();
  }
}

export function toggleComplete(progress, track, lesson) {
  if (!Object.hasOwn(tracks, track) || !lessonIds.includes(lesson)) return progress;
  const completed = progress[track];
  return { ...progress, [track]: completed.includes(lesson) ? completed.filter(id => id !== lesson) : [...completed, lesson] };
}

export function writeProgress(storage, progress) {
  try {
    storage.setItem(storageKey, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
