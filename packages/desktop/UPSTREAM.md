# Upstream Pin & Sync Policy

Single source of truth for the upstream Excalidraw baseline this fork tracks, and the procedure for re-syncing it. Referenced by `TaskList.md` §0.3 (diff-surface budget) and PU §6.4 (upstream sync policy).

## 1. Upstream identity

| Field | Value |
| --- | --- |
| Canonical repository | `https://github.com/excalidraw/excalidraw` |
| `upstream` remote | `https://github.com/excalidraw/excalidraw.git` |
| `origin` remote (this fork) | `https://github.com/DevinderGit/notexcalidraw.git` |
| **Pinned commit** | `ed10ac7dca7e40f3f4a31269b4bfba980d0db41e` |
| Pinned commit date | 2026-10-01 16:39:40 +02:00 |
| Pinned commit subject | `feat(editor): alt-drag the text being edited to duplicate it (#12219)` |
| Component library version at pin | `@excalidraw/excalidraw` v0.18.0 |
| Package manager | Yarn Classic 1.22.22 — the root `packageManager` field is authoritative (do **not** migrate to Yarn Berry) |
| TypeScript / React / Vite / Vitest at pin | 5.9.3 / 19 / 5.0.12 / 3.0.6 |

**Do not re-pin to a different commit without a task that says so.** Changing the pin invalidates every `packages/desktop/**` line-number reference in `TaskList.md`.

## 2. Branch model

| Branch / ref | Purpose |
| --- | --- |
| `desktop-v1` | Long-lived integration branch. All desktop work lands here. Its base is the pinned commit. |
| `upstream/master` | Remote-tracking ref for upstream's development line, fetched for diffing. Not a working branch — never commit to it. |
| `v*` tags | Upstream release tags, fetched from `upstream`. Sync targets (§3). |
| `main` | Local mirror of the upstream baseline, pointing at the pinned commit. Not a working branch — `desktop-v1` is where work happens. Useful as the fork's default branch on GitHub. |

Rules:

- `desktop-v1` is never rebased onto `master` or onto `@master` on upstream — only onto a **release tag** on our line (see §3).
- Upstream is tracked by **release tags**, never by a moving branch ref, so a sync is reproducible: the same tag always means the same upstream tree.
- The fork never merges upstream history into `desktop-v1` with a merge commit. Syncs are rebases (or cherry-picks, per §3) so the desktop commits stay reviewable on top.
- Upstream's own feature branches (`zsviczian-*`, `refs/heads/*` fan-out) are never tracked. Only `master` and `v*` tags are fetched.

### 2.1 Branches on the GitHub fork

`https://github.com/DevinderGit/notexcalidraw` currently carries three branches:

| Remote branch | Points at | Purpose |
| --- | --- | --- |
| `origin/desktop-v1` | our commits, on top of the pin | **The working branch.** All desktop work lands here. |
| `origin/main` | the pinned commit `ed10ac7d` | Mirror of the upstream baseline; the fork's base for diffing. |
| `origin/master` | upstream's current HEAD (`b7de45e8` at fork time) | **Auto-created by GitHub when the fork was made.** Not ours, not a sync target. |

> ⚠️ `origin/master` is **not** a sync target. It is upstream's moving development line and moves independently of our pin. Sync targets are release tags on our line — see §3. GitHub also set `master` as the fork's default branch; if that is confusing, change the default to `desktop-v1` in the repo's **Settings → Branches** page.

## 3. Release-line topology (read before syncing)

Upstream publishes two kinds of refs, and conflating them is the most common sync mistake:

1. **Development line** — `master`. Continuous, unreleased commits. Our pin sits on this line: `v0.18.0` → **429 commits** → `ed10ac7d` (the pin).
2. **Patch/backport lines** — a `vX.Y.Z` tag branched off an _older_ release. Example: `v0.18.1` is a single backport commit ("fix: backport mermaid xss fix to 0.18.1") branched from `v0.18.0`, and is therefore **not** a descendant of our pin.

Verified topology at the pin:

| Ref | Relationship to the pin |
| --- | --- |
| `v0.18.0` | **is** an ancestor of the pin (newest release tag on our line) |
| `v0.18.1` | is **not** an ancestor — divergent backport line off `v0.18.0` |
| `upstream/master` | is a descendant of the pin — 17 commits ahead as of 2026-10-24 |

Consequences for syncing:

- **Routine sync** → rebase onto the newest `v*` tag that is a _descendant_ of our current base (the next `v0.19.0`-style tag on the development line). Check with `git merge-base --is-ancestor <tag> desktop-v1`.
- **Security backport** (a fix published only on a patch line, e.g. the `v0.18.1` mermaid XSS fix) → **cherry-pick** the fix commit onto `desktop-v1`. Never rebase onto a divergent patch tag; that would rewrite the entire desktop commit stack.
- The upstream `master` line between the pin and the next release tag may contain breaking changes; the release tag is the safe sync target, `master` is the early-warning signal.

## 4. Sync procedure

Run from the repo root. Never sync with a dirty working tree.

```bash
# 1. Fetch upstream tags and the development line
git fetch upstream --tags
git fetch upstream master

# 2. Choose the target: newest v* tag that is a descendant of our current base
git tag --list 'v*' --sort=-v:refname | head
git merge-base --is-ancestor <candidate-tag> desktop-v1 && echo "valid target"

# 3. Rebase the desktop commits onto it
git rebase <candidate-tag> desktop-v1

# 4. Resolve conflicts ONLY inside the sanctioned files (§5). For anything else,
#    adapt desktop-owned code in packages/desktop/** or excalidraw-app/desktop/**.

# 5. Re-lock dependencies if upstream changed any package.json
yarn install --frozen-lockfile   # or plain `yarn install` if yarn.lock legitimately changed

# 6. Mandatory gates — the upstream suite is the regression oracle
yarn test:typecheck
yarn test:code
yarn test:app --watch=false
```

If upstream's `yarn.lock` changed, the rebase will conflict in `yarn.lock`. Take **upstream's** lockfile only after checking that none of our desktop workspace dependencies (`packages/desktop/package.json`) are missing from it; otherwise merge both sides and re-run `yarn install`.

## 5. Rebase conflict checklist

The diff-surface budget (`TaskList.md` §0.3) is deliberately small so rebases are cheap. These seven upstream files are the only shared files we may modify — **every upstream conflict we can legitimately have is in one of them**:

| File | Sanctioned modification | Task |
| --- | --- | --- |
| `packages/excalidraw/data/filesystem.ts` | Injectable `FileSystemAdapter` seam, default behavior unchanged | D-19 |
| `packages/excalidraw/index.tsx` | Re-export `registerFileSystemAdapter` + adapter types | D-19 |
| `excalidraw-app/index.tsx` | Runtime-guard `registerSW()`; conditional desktop bootstrap import | D-15, D-16 |
| `excalidraw-app/vite.config.mts` | Mode-aware plugin config (desktop mode) | D-14 |
| `excalidraw-app/App.tsx` | Minimal `IS_DESKTOP`-gated conditionals (collab UI toggle, Plus UI gating) | D-17 |
| `excalidraw-app/components/AppMainMenu.tsx` | Mount desktop menu-command handler | D-25 |
| `excalidraw-app/app_constants.ts` | Add desktop-only storage key constant | D-28 |

Root-level files are **not** restricted by the budget, but upstream touches them too, so treat them as secondary conflict sites:

- `package.json` (root) — workspace scripts, desktop aliases
- `vitest.config.mts` — alias additions for `@excalidraw/desktop/*`
- `.env.desktop` — desktop-only env file (upstream has no equivalent; conflicts are unlikely)
- `.github/workflows/*` — CI and release workflows
- `yarn.lock` — dependency lockfile
- `CLAUDE.md` (root) — **our** desktop project contract replaces upstream's generic file; upstream's original is preserved verbatim at `docs/upstream/CLAUDE.md`. If upstream edits `CLAUDE.md`, expect a conflict here — resolve in favour of ours and copy any upstream-relevant additions into `docs/upstream/CLAUDE.md`.

New files are unrestricted: `packages/desktop/**` and `excalidraw-app/desktop/**` are desktop-owned and never conflict with upstream.

## 6. Toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| Node | _see §6.1_ | Desktop toolchain requires ≥ 20 LTS (22 recommended); upstream declares ≥ 18 |
| Yarn | _see §6.1_ | Yarn Classic 1.22.22, via the root `packageManager` field |
| Electron | _see §6.1_ | Pinned exactly in `packages/desktop/package.json` (floor `^38`) — D-06 |
| Windows build host | Windows 10/11 x64 | Required for the packaging tasks (D-30…D-35) |

### 6.1 Recorded toolchain versions & baseline verification note

> Recorded at fork time (**D-01**), re-confirmed by **D-02** (baseline green-state verification). Update this section whenever the toolchain is re-pinned.

**Build host**

| Field | Value |
| --- | --- |
| OS | Windows 11 Pro, 25H2 (10.0.26200 build 26200) |
| Architecture | x64 |
| Machine | DESKTOP-N1NL0RB |
| Developer Mode | Disabled |
| Elevation | Not elevated (standard user) |
| Shell | Git Bash / MinGW — nvm reports this as "unsupported"; irrelevant, all builds run through npm scripts |

**Toolchain**

| Tool | Version used | Notes |
| --- | --- | --- |
| Node | **v22.23.4** (LTS "Jod") | Provisioned via nvm-windows v2.0.1 (shim mode). Node 24 is explicitly out of scope for this project. |
| npm | 10.9.9 | Bundled with Node 22.23.4 |
| Yarn | **1.22.22** (Yarn Classic) | Matches the root `packageManager` field. Resolved through the nvm shim. |
| Electron | **45.0.0** | Pinned exactly in `packages/desktop/package.json` (floor `^38`). Bundles Chromium 156.0.8078.48. That Node 24.19.0 is the runtime _inside_ Electron — the build toolchain is Node 22.23.4. |

**Getting Node 22 on this host**

`node` must resolve through the nvm shim (`C:\Users\User\AppData\Local\Author Software\nvm\.shim`), because the **machine** PATH still contains the pre-existing `C:\Program Files\nodejs` (Node 24) and the _user_ PATH is appended _after_ the machine PATH — a user-level shim entry can therefore never win. Until the machine PATH is reordered, prefix every build command with:

```bash
export PATH="/c/Users/User/AppData/Local/Author Software/nvm/.shim:$PATH"
```

Verify with `node -v` → `v22.23.4` and `yarn -v` → `1.22.22`.

**Baseline suite results (D-02)**

Run at the pinned commit `ed10ac7d` on the host above, under Node v22.23.4 / Yarn 1.22.22, on 2026-10-24. This is the **authoritative baseline** — the upstream Vitest suite is the regression oracle for every later task.

| Command | Exit code | Result |
| --- | --- | --- |
| `yarn install` | 0 | 131 s. Workspaces hoisted (`node_modules/@excalidraw/*` symlinked to the local packages). `yarn.lock` unchanged. |
| `yarn test:typecheck` | 0 | `tsc`, 19 s, no errors |
| `yarn test:code` | 0 | `eslint --max-warnings=0 --ext .js,.ts,.tsx .`, 48 s, no warnings |
| `yarn test:app --watch=false` | 0 | Vitest: **141 test files passed, 2448 tests passed**, 47 skipped, 1 todo (2496 total), 76 s |

The test count matches the baseline recorded in PU §"Verification note" (2,448 tests / 0 failures), which confirms the Windows + Node 22 host reproduces upstream's ubuntu result exactly. **The D-02 Windows-host escape hatch was therefore not invoked** and D-04 was not pulled forward.

Two upstream (non-failing) messages are expected on this host and are not regressions:

- `eslint` prints `The prop value with an expression type of MetaProperty could not be resolved` (a `jsx-ast-utils` upstream issue) — exit code is still 0.
- `yarn install` prints `Resolution field "strip-ansi@6.0.1" is incompatible with requested version "strip-ansi@^7.0.1"` and various `unmet peer dependency` warnings — both are upstream lockfile/peer-range conditions, present at the pinned commit.

## 7. Local environment notes (Windows build host)

- Upstream CI runs on ubuntu only. If a suite fails on Windows but passes in CI, record it as a Windows-only environment issue and treat the CI result as authoritative (`TaskList.md` D-02 escape hatch). WSL2 is an acceptable local fallback host.
- Line endings: upstream's `.gitattributes` sets `* text=auto eol=lf`, so **tracked files are LF in the worktree and LF in the object database**, on every platform. This overrides the host's `core.autocrlf=true`. Do not "fix" CRLF warnings by changing `core.autocrlf` — respect `.gitattributes`.
- Because `.gitattributes` only applies to files Git already tracks, adding a _new_ file on a host with `core.autocrlf=true` can produce an "LF will be replaced by CRLF" warning and store CRLF in the blob. Verify with `git ls-files --eol <path>` (expect `i/lf w/lf`) and renormalize with `git add --renormalize <path>` if it says otherwise.
- **Docker**: CLI 29.8.0 is installed but the Docker Desktop daemon is **not running** by default. Start it before relying on a local container as an ubuntu control run; the D-02 escape hatch is better served by the D-04 CI job.
- **GitHub CLI**: `gh` is **not installed** on this host. Remotes are managed with plain `git` (`git remote add` / `git push`), and the `origin` fork is `https://github.com/DevinderGit/notexcalidraw.git`.
- The account running the build is a **standard (non-elevated) user** on this machine. Anything requiring administrator rights (e.g. editing the machine PATH) needs an explicit UAC-approved step and cannot be done from an unattended shell.
- **Electron 45 removed its `postinstall` hook**, so the 151 MB platform binary is no longer fetched by `yarn install` on its own — the `electron` package ships an `install-electron` bin instead. `packages/desktop/package.json` re-adds the hook as a `postinstall` script. Full explanation in `packages/desktop/README.md` §2.2. On this host the binary comes from `ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/` (GitHub's release CDN is throttled to ~20 KB/s here); the result was verified byte-identical to GitHub's official release against both `checksums.json` (npm) and `SHASUMS256.txt` (GitHub).

### 7.1 Known flaky upstream test — `MermaidToExcalidraw`

`packages/excalidraw/tests/MermaidToExcalidraw.test.tsx` → _"should open mermaid popup when active tool is mermaid"_ is a **pre-existing upstream flake**. It is not caused by any desktop change, and it is **not** a regression introduced by this fork.

**Mechanism.** The test waits for the dialog's canvas _element_ and then snapshots the whole dialog:

```tsx
await waitFor(() => expect(dialog.querySelector("canvas")).not.toBeNull());
expect(normalizeDialogSnapshot(dialog)).toMatchSnapshot();
```

The canvas element also exists in the dialog's **error** state (inside `ttd-dialog-output-canvas-container invisible`). Mermaid's render is async, so under load the `waitFor` resolves before the render completes, the dialog is momentarily in the `Invalid mermaid definition` state, and the snapshot captures the error markup instead of the rendered canvas.

**Measured on this host (2026-10-24, Node 22.23.4):**

| Scenario                                     | Result              |
| -------------------------------------------- | ------------------- |
| Full suite (`yarn test:app --watch=false`)   | 1 failure in 4 runs |
| That test in isolation (`vitest run <file>`) | 6 / 6 passed        |

**Do not "fix" it by updating the snapshot** — that would mask a real upstream race and diverge from upstream. The upstream test file is also outside the diff-surface budget, so it must not be edited. If a CI run turns red on this test, re-run the suite: it is this flake unless the failure message differs.

This matters for two planned tasks:

- **D-04** — the first CI push may go red on this test alone. Do not weaken the gate to hide it; re-run and confirm.
- **D-37** — the e2e flake budget is < 5 % across 10 runs. This upstream flake does not affect the Playwright e2e suite, but it does eat into the Vitest budget, so measure the two separately.
