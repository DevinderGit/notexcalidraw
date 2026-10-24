# Upstream Pin & Sync Policy

Single source of truth for the upstream Excalidraw baseline this fork tracks, and the
procedure for re-syncing it. Referenced by `TaskList.md` §0.3 (diff-surface budget) and
PU §6.4 (upstream sync policy).

## 1. Upstream identity

| Field | Value |
|---|---|
| Canonical repository | `https://github.com/excalidraw/excalidraw` |
| `upstream` remote | `https://github.com/excalidraw/excalidraw.git` |
| `origin` remote (this fork) | `https://github.com/DevinderGit/notexcalidraw.git` |
| **Pinned commit** | `ed10ac7dca7e40f3f4a31269b4bfba980d0db41e` |
| Pinned commit date | 2026-10-01 16:39:40 +02:00 |
| Pinned commit subject | `feat(editor): alt-drag the text being edited to duplicate it (#12219)` |
| Component library version at pin | `@excalidraw/excalidraw` v0.18.0 |
| Package manager | Yarn Classic 1.22.22 — the root `packageManager` field is authoritative (do **not** migrate to Yarn Berry) |
| TypeScript / React / Vite / Vitest at pin | 5.9.3 / 19 / 5.0.12 / 3.0.6 |

**Do not re-pin to a different commit without a task that says so.** Changing the pin
invalidates every `packages/desktop/**` line-number reference in `TaskList.md`.

## 2. Branch model

| Branch / ref | Purpose |
|---|---|
| `desktop-v1` | Long-lived integration branch. All desktop work lands here. Its base is the pinned commit. |
| `upstream/master` | Remote-tracking ref for upstream's development line, fetched for diffing. Not a working branch — never commit to it. |
| `v*` tags | Upstream release tags, fetched from `upstream`. Sync targets (§3). |
| `main` | Local-only branch holding the initial project-docs import commit. Not a working branch; it will be repointed at the pinned commit (or dropped) before the first push to `origin`. |

Rules:

- `desktop-v1` is never rebased onto `master` or onto `@master` on upstream — only onto a
  **release tag** on our line (see §3).
- Upstream is tracked by **release tags**, never by a moving branch ref, so a sync is
  reproducible: the same tag always means the same upstream tree.
- The fork never merges upstream history into `desktop-v1` with a merge commit. Syncs are
  rebases (or cherry-picks, per §3) so the desktop commits stay reviewable on top.
- Upstream's own feature branches (`zsviczian-*`, `refs/heads/*` fan-out) are never
  tracked. Only `master` and `v*` tags are fetched.

## 3. Release-line topology (read before syncing)

Upstream publishes two kinds of refs, and conflating them is the most common sync mistake:

1. **Development line** — `master`. Continuous, unreleased commits. Our pin sits on this
   line: `v0.18.0` → **429 commits** → `ed10ac7d` (the pin).
2. **Patch/backport lines** — a `vX.Y.Z` tag branched off an *older* release. Example:
   `v0.18.1` is a single backport commit ("fix: backport mermaid xss fix to 0.18.1")
   branched from `v0.18.0`, and is therefore **not** a descendant of our pin.

Verified topology at the pin:

| Ref | Relationship to the pin |
|---|---|
| `v0.18.0` | **is** an ancestor of the pin (newest release tag on our line) |
| `v0.18.1` | is **not** an ancestor — divergent backport line off `v0.18.0` |
| `upstream/master` | is a descendant of the pin — 17 commits ahead as of 2026-10-24 |

Consequences for syncing:

- **Routine sync** → rebase onto the newest `v*` tag that is a *descendant* of our current
  base (the next `v0.19.0`-style tag on the development line). Check with
  `git merge-base --is-ancestor <tag> desktop-v1`.
- **Security backport** (a fix published only on a patch line, e.g. the `v0.18.1` mermaid
  XSS fix) → **cherry-pick** the fix commit onto `desktop-v1`. Never rebase onto a
  divergent patch tag; that would rewrite the entire desktop commit stack.
- The upstream `master` line between the pin and the next release tag may contain breaking
  changes; the release tag is the safe sync target, `master` is the early-warning signal.

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

If upstream's `yarn.lock` changed, the rebase will conflict in `yarn.lock`. Take
**upstream's** lockfile only after checking that none of our desktop workspace
dependencies (`packages/desktop/package.json`) are missing from it; otherwise merge
both sides and re-run `yarn install`.

## 5. Rebase conflict checklist

The diff-surface budget (`TaskList.md` §0.3) is deliberately small so rebases are cheap.
These seven upstream files are the only shared files we may modify — **every upstream
conflict we can legitimately have is in one of them**:

| File | Sanctioned modification | Task |
|---|---|---|
| `packages/excalidraw/data/filesystem.ts` | Injectable `FileSystemAdapter` seam, default behavior unchanged | D-19 |
| `packages/excalidraw/index.tsx` | Re-export `registerFileSystemAdapter` + adapter types | D-19 |
| `excalidraw-app/index.tsx` | Runtime-guard `registerSW()`; conditional desktop bootstrap import | D-15, D-16 |
| `excalidraw-app/vite.config.mts` | Mode-aware plugin config (desktop mode) | D-14 |
| `excalidraw-app/App.tsx` | Minimal `IS_DESKTOP`-gated conditionals (collab UI toggle, Plus UI gating) | D-17 |
| `excalidraw-app/components/AppMainMenu.tsx` | Mount desktop menu-command handler | D-25 |
| `excalidraw-app/app_constants.ts` | Add desktop-only storage key constant | D-28 |

Root-level files are **not** restricted by the budget, but upstream touches them too, so
treat them as secondary conflict sites:

- `package.json` (root) — workspace scripts, desktop aliases
- `vitest.config.mts` — alias additions for `@excalidraw/desktop/*`
- `.env.desktop` — desktop-only env file (upstream has no equivalent; conflicts are unlikely)
- `.github/workflows/*` — CI and release workflows
- `yarn.lock` — dependency lockfile
- `CLAUDE.md` (root) — **our** desktop project contract replaces upstream's generic file;
  upstream's original is preserved verbatim at `docs/upstream/CLAUDE.md`. If upstream
  edits `CLAUDE.md`, expect a conflict here — resolve in favour of ours and copy any
  upstream-relevant additions into `docs/upstream/CLAUDE.md`.

New files are unrestricted: `packages/desktop/**` and `excalidraw-app/desktop/**` are
desktop-owned and never conflict with upstream.

## 6. Toolchain

| Tool | Version | Notes |
|---|---|---|
| Node | *see §6.1* | Desktop toolchain requires ≥ 20 LTS (22 recommended); upstream declares ≥ 18 |
| Yarn | *see §6.1* | Yarn Classic 1.22.22, via the root `packageManager` field |
| Electron | *see §6.1* | Latest stable at scaffold time, pinned exact in `packages/desktop/package.json` (floor `^38`) — D-06 |
| Windows build host | Windows 10/11 x64 | Required for the packaging tasks (D-30…D-35) |

### 6.1 Recorded toolchain versions

> Populated by **D-02** (baseline green-state verification). Do not edit by hand; update
> this section when the toolchain is re-pinned.

| Tool | Version used | Notes |
|---|---|---|
| Node | v24.21.0 | Installed on the Windows build host |
| Yarn | *(pending — D-02)* | Yarn Classic 1.22.22 must be installed; it was not present on the build host at fork time |

## 7. Local environment notes (Windows build host)

- Upstream CI runs on ubuntu only. If a suite fails on Windows but passes in CI, record it
  as a Windows-only environment issue and treat the CI result as authoritative
  (`TaskList.md` D-02 escape hatch). WSL2 is an acceptable local fallback host.
- Line endings: upstream's `.gitattributes` sets `* text=auto eol=lf`, so **tracked files
  are LF in the worktree and LF in the object database**, on every platform. This
  overrides the host's `core.autocrlf=true`. Do not "fix" CRLF warnings by changing
  `core.autocrlf` — respect `.gitattributes`.
- Because `.gitattributes` only applies to files Git already tracks, adding a *new* file
  on a host with `core.autocrlf=true` can produce an "LF will be replaced by CRLF"
  warning and store CRLF in the blob. Verify with `git ls-files --eol <path>` (expect
  `i/lf w/lf`) and renormalize with `git add --renormalize <path>` if it says otherwise.
