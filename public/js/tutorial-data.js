import { claudeLessons } from './tutorials-claude.js';
import { codexLessons } from './tutorials-codex.js';

export const verifiedAt = '2026-11-14';
export const lessonIds = ['setup', 'basics', 'workflow', 'extend', 'collaborate', 'security', 'recipes'];
export const lessonLabels = ['설치와 준비', '기본 사용법', '계획·구현·검증', 'MCP와 스킬', '협업과 반복 개선', '설정과 보안', '내 업무에 적용'];
export const tracks = {
  claude: { name: 'Claude Code', description: '대화부터 프로젝트 규칙과 스킬까지', lessons: claudeLessons },
  codex: { name: 'Codex', description: '작업 폴더부터 검토와 협업까지', lessons: codexLessons }
};
