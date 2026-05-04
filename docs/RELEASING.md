# Releasing the chrome extension

Step-by-step for cutting a new version. Don't deviate without good reason — the
auto-updater is fragile to small mistakes (missed asset, wrong tag format,
unbumped manifest).

## Pre-release checklist

Before you start, all of these must be true:

- [ ] Branch is merged to `main` via PR (no direct pushes)
- [ ] You're on `main` locally with the merge commit pulled
- [ ] `git status` is clean
- [ ] `npm run build` produces a green build
- [ ] You've manually loaded `dist/` into Chrome and smoke-tested the change

## Version bump

Only one file gets bumped: `manifest.json`. The `package.json` version is
not used for distribution.

```bash
# Find current version
grep '"version"' manifest.json
# Edit manifest.json — bump the patch (or minor/major as appropriate)
# Commit on main
git add manifest.json
git commit -m "chore: bump to vX.Y.Z

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Versioning convention: patch bumps for fixes, minor for features, major for
breaking changes. We've been generous with patch bumps; that's fine — the
auto-updater doesn't care about semver, just exact version match.

## Build the production zip

```bash
npm run zip
```

This runs `build:prod` (Vite build with mode=production) into `dist-prod/`,
then zips its contents into `super-ltc-extension.zip` at repo root.

The zip MUST contain:
- `manifest.json` with the new version number (verify: `unzip -p super-ltc-extension.zip manifest.json | grep version`)
- All five updater files at top level:
  - `install-auto-updater.bat`
  - `uninstall-auto-updater.bat`
  - `update-super-ltc.bat`
  - `update-super-ltc-silent.ps1`
  - `update-super-ltc-launcher.vbs`
- The extension directory tree (`content/`, `popup/`, `assets/`, `lib/`, etc.)

If anything's missing, stop and fix the build config — don't ship a partial.

## Cut the GitHub release

This is where it's easy to mess up. Two assets must be uploaded:

1. `super-ltc-extension.zip` — the primary distribution (auto-updater consumes this)
2. `update-super-ltc.bat` — standalone link target for manual installs

The auto-updater script (`update-super-ltc-silent.ps1`) finds the first
`*.zip` asset on `releases/latest` and downloads it. If you forget the zip,
auto-update breaks for everyone. If you forget the `.bat`, any external link
to `https://github.com/.../releases/download/vX.Y.Z/update-super-ltc.bat`
returns 404.

Use the gh CLI (do NOT use the GitHub web UI — easier to forget an asset):

```bash
gh release create vX.Y.Z \
  super-ltc-extension.zip \
  update-super-ltc.bat \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
## Short title summarizing the release

Brief paragraph framing what this release is about.

### Section per major area

- Bullet describing user-visible change
- Another bullet

### Backward compat

(Always include a note here for releases that touch API contracts.)

EOF
)"
```

Tag format MUST be `vMAJOR.MINOR.PATCH` (with the `v` prefix). The updater
strips the `v` when comparing to the local manifest version. Tag without `v`
or with anything else and existing installs won't see the update.

## Verify the release

Check three things before walking away:

```bash
# 1. Both assets present
gh release view vX.Y.Z --json assets -q '.assets[] | "\(.name) \(.size)B"'
# Expected output:
#   super-ltc-extension.zip 4XXXXXXB
#   update-super-ltc.bat 4330B

# 2. Manifest version inside the zip matches
unzip -p super-ltc-extension.zip manifest.json | grep version
# Expected: "version": "X.Y.Z"

# 3. The .bat link doesn't 404
curl -sI -L https://github.com/Superjonathan123/chrome-ext/releases/download/vX.Y.Z/update-super-ltc.bat | head -1
# Expected: HTTP/2 302 (redirects to the actual asset)

# 4. The release is marked latest
gh release list --limit 3
# Expected: your release row shows "Latest"
```

If any of those fail, fix immediately — `gh release upload <tag> <file>` adds
a missed asset, `gh release edit <tag> --notes "..."` fixes the body.

## What happens for users

- **Auto-update users (Windows + scheduled task installed):** Within 30
  minutes, the task fires `update-super-ltc-silent.ps1`, which hits the
  releases-latest API, sees the new tag, downloads the zip, unpacks it over
  the install dir, and a banner in PCC prompts them to click Reload.
- **Manual users:** Visit the releases page, download the zip, follow the
  install instructions in the README. Or run `update-super-ltc.bat` from a
  shortcut if they have one.
- **Mac users:** No auto-updater; we tell them to download the zip manually.
  (If you ever build a Mac auto-updater, document it here.)

## After the release

- Delete the local `super-ltc-extension.zip` from the repo root if you want
  (it's gitignored anyway). `dist/` and `dist-prod/` are also gitignored.
- The merged feature branch can be deleted: `git branch -d <branch>`.

## Rollback

If the release is broken (zip missing, manifest wrong, code regression):

1. **Delete the broken release immediately** so the auto-updater stops
   serving it: `gh release delete vX.Y.Z --yes --cleanup-tag`
2. The previous release becomes "Latest" again automatically.
3. Existing users who already auto-updated to the broken version will roll
   forward when the next good release ships — they can't roll back without
   manual reinstall (the updater only goes forward).

If you can't delete fast enough and users are already breaking:
- Cut a hotfix bump (`vX.Y.Z+1`) with the broken commit reverted
- Push it as the latest release
- Auto-updater pulls it on the next 30-min poll

## Common mistakes (learned the hard way)

- **Bumping `package.json` instead of `manifest.json`** — package.json is
  build-system metadata, not the distributed version. Auto-updater reads
  `manifest.json`.
- **Forgetting `update-super-ltc.bat` as a separate asset** — it's inside
  the zip, but external links target it directly. Forgetting it 404s those
  links. (Caught on v1.0.28 — fixed by uploading separately.)
- **Editing the release on the GitHub web UI** — easy to drop assets.
  Always use `gh` CLI.
- **Tag without `v` prefix** — updater won't recognize it. Use `v1.0.28`,
  not `1.0.28`.
- **Pushing the bump commit but forgetting the release** — version is
  bumped on main but no install gets it because there's no release to pull.
  Always do bump → build → release as one block.
- **Building locally with stale node_modules** — if you've been switching
  branches, `rm -rf node_modules && npm install` before the prod build.
- **Skipping the verification step** — the `curl -sI` check on the .bat URL
  takes 5 seconds and would have caught the v1.0.28 missing-asset issue.

## One-liner for fast bumps

For when you've reviewed everything and just want to ship:

```bash
# Bump, build, release in one shot
VERSION=1.0.29 \
  && sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" manifest.json \
  && git add manifest.json \
  && git commit -m "chore: bump to v$VERSION" \
  && git push origin main \
  && npm run zip \
  && gh release create v$VERSION super-ltc-extension.zip update-super-ltc.bat \
       --title "v$VERSION" --notes "Release notes here." \
  && gh release view v$VERSION --json assets -q '.assets[].name'
```

Don't actually use this without writing real release notes. It's here as a
shape reference, not a production command.
