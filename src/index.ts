/**
 * @magicpixelart/vite — Vite plugin that runs the MagicPixel CLI sync watcher
 * tied to your Vite dev server's lifecycle.
 *
 * Why:
 *   The CLI's `magicpixel sync --watch` polls the manifest every 2s and writes
 *   any changes to disk. Vite's built-in file watcher then triggers HMR on
 *   imports of those files. The only friction was that the user had to run the
 *   CLI in a second terminal. This plugin removes that friction by spawning
 *   the same CLI process as a child of `vite dev` and cleaning it up on close.
 *
 * Usage:
 *   // vite.config.ts
 *   import { magicpixel } from '@magicpixelart/vite';
 *   export default defineConfig({
 *     plugins: [react(), magicpixel()],
 *   });
 *
 * Pre-req:
 *   Run `npx magicpixel start` once to authenticate and create magicpixel.json.
 *   The plugin no-ops with a friendly hint if either is missing.
 */
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

export interface MagicPixelPluginOptions {
  /** Poll interval in seconds. Defaults to the CLI default (2s). Floor: 2. */
  intervalSec?: number;
  /** Skip the one-shot sync that normally runs at `vite build` start. */
  skipOnBuild?: boolean;
  /**
   * Print CLI output verbatim instead of letting --quiet collapse no-op ticks.
   * Useful for debugging; noisy in normal use.
   */
  verbose?: boolean;
}

interface CliBin {
  binPath: string;
  pkgVersion: string;
}

function findCliBin(cwd: string): CliBin | null {
  // Resolve from the consumer's project root so we pick up their installed
  // CLI version, not whatever might be hoisted in a monorepo elsewhere.
  const req = createRequire(resolve(cwd, 'package.json'));
  try {
    const pkgJsonPath = req.resolve('@magicpixelart/cli/package.json');
    const pkg = req('@magicpixelart/cli/package.json') as {
      bin?: Record<string, string> | string;
      version?: string;
    };
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.magicpixel;
    if (!bin) return null;
    return {
      binPath: resolve(dirname(pkgJsonPath), bin),
      pkgVersion: pkg.version ?? 'unknown',
    };
  } catch {
    return null;
  }
}

type LogFn = (msg: string) => void;
type LogLevel = 'info' | 'warn';

function makeLogger(server: ViteDevServer | null): { log: LogFn; warn: LogFn } {
  if (server) {
    return {
      log: (m) => server.config.logger.info(m),
      warn: (m) => server.config.logger.warn(m),
    };
  }
  // Build context — fall back to console; rollup's `this.warn` wraps as
  // build warnings which is too loud for routine sync output.
  return {
    log: (m) => console.log(m),
    warn: (m) => console.warn(m),
  };
}

interface SpawnResult {
  child: ChildProcess;
}

function spawnSync(
  mode: 'watch' | 'once',
  cwd: string,
  opts: MagicPixelPluginOptions,
  logger: { log: LogFn; warn: LogFn },
): SpawnResult | null {
  const cli = findCliBin(cwd);
  if (!cli) {
    logger.warn(
      '[magicpixel] @magicpixelart/cli is not installed in this project. ' +
        'Install it with `npm i -D @magicpixelart/cli` (it ships as a dependency of ' +
        '@magicpixelart/vite, so this normally Just Works — check your package manager ' +
        'hoisting).',
    );
    return null;
  }
  if (!existsSync(resolve(cwd, 'magicpixel.json'))) {
    logger.warn(
      '[magicpixel] no magicpixel.json found in project root. ' +
        'Run `npx magicpixel start` to authenticate and pick a project, ' +
        'then restart Vite. Plugin is idle until then.',
    );
    return null;
  }

  // Always pass --quiet in watch mode unless `verbose` was requested. The
  // plugin prefixes every line with `[magicpixel]` for log clarity; the CLI's
  // own carriage-return-driven no-op ticker would garble that prefix.
  const args: string[] = mode === 'watch'
    ? [
        'sync',
        '--watch',
        String(Math.max(2, opts.intervalSec ?? 2)),
        ...(opts.verbose ? [] : ['--quiet']),
      ]
    : ['sync'];

  const child = spawn(process.execPath, [cli.binPath, ...args], {
    cwd,
    // Detached: false so the child dies with the parent if vite is killed
    // hard (e.g. parent process group SIGKILL).
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  });

  let sawAuthHint = false;
  const handleLine = (chunk: Buffer) => {
    // Strip C0/C1 control bytes (except tab and the ESC that starts ANSI color
    // sequences) before splitting on \n. Defense-in-depth: the plugin is the
    // trust boundary between the child process stdout and the dev's terminal.
    const text = chunk
      .toString('utf8')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r/g, '').trimEnd();
      if (!line) continue;
      if (!sawAuthHint && /key looks invalid|API key rejected|not authenticated/i.test(line)) {
        sawAuthHint = true;
        logger.warn(`[magicpixel] ${line}`);
        logger.warn('[magicpixel] hint: run `npx magicpixel doctor` for a full diagnosis.');
        continue;
      }
      logger.log(`[magicpixel] ${line}`);
    }
  };
  child.stdout?.on('data', handleLine);
  child.stderr?.on('data', handleLine);
  child.on('error', (err) => {
    logger.warn(`[magicpixel] failed to spawn CLI: ${err.message}`);
  });
  child.on('exit', (code, signal) => {
    // Quiet exit if we asked it to stop (SIGINT/SIGTERM during shutdown).
    if (signal === 'SIGINT' || signal === 'SIGTERM') return;
    if (mode === 'watch' && code !== 0 && code !== null) {
      logger.warn(`[magicpixel] sync watcher exited with code ${code}. Run \`npx magicpixel doctor\` for a diagnosis.`);
    }
  });

  logger.log(
    `[magicpixel] ${mode === 'watch' ? 'watching for changes' : 'syncing'} ` +
      `(cli ${cli.pkgVersion})`,
  );
  return { child };
}

function stopChild(child: ChildProcess | null): null {
  if (child && !child.killed && child.exitCode === null) {
    try {
      child.kill('SIGINT');
    } catch {
      // process may have already exited between checks
    }
  }
  return null;
}

export function magicpixel(opts: MagicPixelPluginOptions = {}): Plugin {
  let cwd = process.cwd();
  let command: ResolvedConfig['command'] = 'serve';
  let child: ChildProcess | null = null;
  // Auto-respawn bookkeeping. Reset to 0 on a child that survives long enough
  // to be considered healthy (>30s); otherwise back off so a hard-failing CLI
  // doesn't loop hot.
  let respawnAttempt = 0;
  let stopped = false;

  // Validate intervalSec up front — silent NaN fallback is a cliff for users
  // who hand-roll the option.
  if (opts.intervalSec !== undefined) {
    if (typeof opts.intervalSec !== 'number' || !Number.isFinite(opts.intervalSec) || opts.intervalSec < 2) {
      throw new Error(
        '[magicpixel] intervalSec must be a finite number >= 2 (seconds).',
      );
    }
  }

  return {
    name: '@magicpixelart/vite',

    configResolved(config) {
      cwd = config.root;
      command = config.command;
    },

    configureServer(server) {
      // Only run in `vite` / `vite dev` — skip preview server, etc.
      if (command !== 'serve') return;
      const logger = makeLogger(server);

      const startWatcher = () => {
        if (stopped) return;
        const result = spawnSync('watch', cwd, opts, logger);
        child = result?.child ?? null;
        if (!child) return;
        const startedAt = Date.now();
        child.once('exit', (code, signal) => {
          if (stopped) return;
          if (signal === 'SIGINT' || signal === 'SIGTERM') return;
          // Healthy session → reset backoff so transient crashes recover fast.
          if (Date.now() - startedAt > 30_000) respawnAttempt = 0;
          // Exponential backoff: 1s, 5s, 15s, 30s, then steady 60s.
          const schedule = [1_000, 5_000, 15_000, 30_000, 60_000];
          const delay = schedule[Math.min(respawnAttempt, schedule.length - 1)] ?? 60_000;
          respawnAttempt++;
          logger.warn(`[magicpixel] respawning watcher in ${delay / 1000}s (attempt ${respawnAttempt})`);
          setTimeout(() => {
            if (!stopped) startWatcher();
          }, delay).unref?.();
        });
      };
      startWatcher();

      const cleanup = () => {
        stopped = true;
        child = stopChild(child);
      };
      server.httpServer?.once('close', cleanup);
      process.once('exit', cleanup);
      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);
    },

    async buildStart() {
      if (command !== 'build' || opts.skipOnBuild) return;
      const logger = makeLogger(null);
      const result = spawnSync('once', cwd, opts, logger);
      if (!result) return;
      // Block the build until the one-shot finishes so output assets are
      // current. A failed sync logs but does NOT abort the build — users
      // should be able to ship from a stale cache during incidents.
      await new Promise<void>((res) => {
        result.child.once('exit', () => res());
      });
    },

    closeBundle() {
      stopped = true;
      child = stopChild(child);
    },
  };
}

export default magicpixel;
