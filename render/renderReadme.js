import { spawnSync } from 'child_process';

const result = spawnSync('npx', ['tsx', 'src/render/renderReadme.ts'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 0);
