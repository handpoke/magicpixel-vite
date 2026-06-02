# Changelog

## 0.2.0

### Added
- **Auto-update `@magicpixelart/cli`.** On dev-server start the plugin
  checks the npm registry once per 24h and, when a newer compatible
  version is available, installs it via the project's package manager
  (bun / pnpm / yarn / npm — detected from the lockfile) before spawning
  the watcher. Beginners no longer need to remember `npm i -D
  @magicpixelart/cli@latest` to pick up server-side schema changes.
  - Default policy: `'minor'` — auto-installs newer minor or patch within
    the same major. Major bumps log a one-liner instead.
  - Configurable via `magicpixel({ autoUpdate: 'patch' | 'minor' | false })`.
  - Disabled automatically when `process.env.CI` is truthy so CI builds
    stay reproducible from the lockfile.
  - Registry check is bounded to ~2.5s; the install runs asynchronously
    (does not block the Node event loop) with a 120s hard timeout. Any
    failure falls back to the installed CLI and logs a single warn line.

### Changed
- Depend on `@magicpixelart/cli@^0.5.0` to ship the legacy slug-folder
  sweep out of the box (fresh installs don't have to wait for the
  auto-update tick).

## 0.1.3


### Changed
- Depend on `@magicpixelart/cli@^0.4.0` (aligns with the current CLI release; `^0.5.0` was unpublished and broke fresh installs).

## 0.1.2

### Fixed
- **Broken `@magicpixelart/cli` dependency in 0.1.1.** The published tarball pinned the CLI to a local `file:` path (`file:../../../../../tmp/magicpixelart-cli-0.3.3.tgz`) that only existed on the publisher's machine, causing `npm i -D @magicpixelart/vite` to fail with `ENOENT` on fresh installs. Now correctly resolves `@magicpixelart/cli@^0.3.3` from the registry.



## 0.1.1

### Added
- **Auto-respawn on unexpected watcher exit.** If the CLI watcher crashes mid-session, the plugin now restarts it with exponential backoff (1s → 5s → 15s → 30s → 60s). A child that stays up >30s resets the backoff so transient blips recover instantly. Previously, a single crash silently stopped sync for the rest of the session.
- **`intervalSec` validation.** Passing a non-finite or `<2` value now throws a clear error at startup instead of silently falling back.
- **Doctor hint on auth failures.** When the watcher prints anything matching invalid-key / not-authenticated, the plugin appends a `Run \`npx magicpixel doctor\`` hint.

### Changed
- **Sanitize C0/C1 control bytes** in forwarded CLI stdout (ANSI color sequences kept). Defense-in-depth at the trust boundary between the child process and the developer's terminal.

## 0.1.0

Initial release.

- `magicpixel()` Vite plugin spawns `magicpixel sync --watch` as a child of
  `vite dev`, tied to dev-server lifecycle (clean shutdown on close, SIGINT,
  SIGTERM, process exit).
- `vite build` runs a single blocking sync to ensure production output has
  fresh assets. Skippable via `skipOnBuild: true`.
- Bundles `@magicpixelart/cli` as a dependency so a single install (`npm i -D
  @magicpixelart/vite`) gets both packages.
- Graceful no-op + warning when `magicpixel.json` or the CLI is missing —
  never crashes the dev server or build.
