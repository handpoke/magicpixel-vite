# Changelog

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
