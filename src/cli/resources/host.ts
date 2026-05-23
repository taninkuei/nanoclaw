import { execSync } from 'child_process';
import { register } from '../registry.js';

register({
  name: 'host-restart',
  resource: 'host',
  description:
    'Rebuild and restart the NanoClaw host process. ' +
    'Runs `pnpm run build` then exits — launchd restarts automatically. ' +
    'Requires owner/admin approval when called from a container.',
  access: 'approval',
  parseArgs: (_raw) => ({}),
  handler: async (_args, _ctx) => {
    // launchd's PATH is narrow (/usr/local/bin:/usr/bin:/bin:~/.local/bin). On
    // Apple Silicon, brew puts pnpm + node in /opt/homebrew/bin — pnpm itself
    // is callable via absolute path, but its child tsc invokes `env node` and
    // needs node visible on PATH too. Same on Intel Macs for /usr/local/bin
    // (already covered) and Linux for nvm/asdf shims, so widen defensively.
    const extraPaths = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      `${process.env.HOME ?? ''}/.local/bin`,
      `${process.env.HOME ?? ''}/.nvm/versions/node/${process.version}/bin`,
    ].filter(Boolean);
    const PATH = [process.env.PATH ?? '', ...extraPaths].join(':');
    execSync('/opt/homebrew/bin/pnpm run build', {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, PATH },
    });
    // Defer the exit so the response can be flushed back to the caller first.
    setTimeout(() => process.exit(0), 500);
    return { status: 'restarting' };
  },
});
