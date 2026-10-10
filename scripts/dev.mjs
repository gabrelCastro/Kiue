// Sobe o jogo (Vite) e a API (server/) juntos, com a saída de cada um identificada.
import { spawn } from 'node:child_process';

const procs = [
  ['jogo', 'npx', ['vite']],
  ['api', 'npx', ['tsx', 'watch', '--clear-screen=false', 'server/src/index.ts']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  const tag = name === 'api' ? '\x1b[35m[api]\x1b[0m ' : '\x1b[36m[jogo]\x1b[0m ';
  for (const stream of [p.stdout, p.stderr]) stream.on('data', (d) => process.stdout.write(d.toString().replace(/^(?=.)/gm, tag)));
  p.on('exit', (code) => {
    for (const other of procs) if (other !== p) other.kill();
    process.exit(code ?? 0);
  });
  return p;
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
