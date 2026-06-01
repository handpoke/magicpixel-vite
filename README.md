# @magicpixelart/vite

Vite plugin that auto-syncs your [MagicPixel](https://magicpixel.art) pixel-art
assets into your project — **no second terminal required**.

Edit a sprite in MagicPixel, hit save, and within ~2 seconds the new PNG is on
disk and your browser hot-reloads.

## Install

```bash
npm i -D @magicpixelart/vite
```

`@magicpixelart/cli` ships as a dependency, so a single install gets you both.

## Configure

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { magicpixel } from '@magicpixelart/vite';

export default defineConfig({
  plugins: [react(), magicpixel()],
});
```

## One-time setup

Run this once in your project root to authenticate and pick a MagicPixel project:

```bash
npx magicpixel start
```

This creates `magicpixel.json` (committed) and `.magicpixel/credentials`
(gitignored, 0600 perms). The plugin is a no-op until both exist — it just
prints a friendly hint and gets out of the way.

## How it works

- **Dev (`vite dev`)**: spawns `magicpixel sync --watch` as a child of your
  Vite process. The watcher polls the MagicPixel manifest every ~2s, downloads
  any changes, and writes them to `src/assets/magicpixel/` (or wherever
  `magicpixel.json` points). Vite's own file watcher picks up the changes and
  triggers HMR.
- **Build (`vite build`)**: runs a single blocking sync before the build starts
  so production output always includes the latest assets.
- **Cleanup**: child process is killed on dev-server close, build end, or
  process exit. No orphaned watchers.

## What triggers a reload?

Editing a sprite re-writes its PNG on disk. Vite's file watcher hot-swaps the
import — **your React state, camera, and game loop keep running**. Renaming or
adding sprites changes the generated `index.ts` barrel; that triggers a normal
HMR module update, still no full page reload. You'll only see a hard reload if
you change the barrel's *shape* in a way Vite can't accept (rare).

If the watcher has been idle for a few minutes it relaxes the poll from 2s to
5–10s. The first change after you come back snaps it instantly back to 2s.

## Options

```ts
magicpixel({
  intervalSec: 2,    // poll interval, seconds (min 2)
  skipOnBuild: false, // skip the one-shot sync during `vite build`
  verbose: false,     // print every CLI tick (debug only — noisy)
});
```

## Troubleshooting

| Symptom                                                | Fix                                                    |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `no magicpixel.json found in project root`             | `npx magicpixel start`                                 |
| `@magicpixelart/cli is not installed in this project`  | `npm i -D @magicpixelart/cli` (or reinstall plugin)    |
| `Your key looks invalid or rotated`                    | `npx magicpixel login` with a fresh key from Settings  |
| Assets aren't updating despite "Pulled N changes" logs | Check that imports resolve through the typed barrel    |

For CI / build-only flows where you don't want a watcher (e.g. `vite build` on
your build server), the plugin already detects build mode and runs a single
sync without spawning a watcher. Use `skipOnBuild: true` to skip even that.

## License

MIT
