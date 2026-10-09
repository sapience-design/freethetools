# How to release

A release gives what is on `main` a version number, release notes and a git tag, so you can see what changed and go back to it. Merging to `main` is still the deploy; a release only names it.

## Choose the version

Follow the rule at the top of [CHANGELOG.md](../../CHANGELOG.md):

| Since the last release | Version |
|---|---|
| A change to URLs, `tool.json` or the API | Major: 2.0.0 → 3.0.0 |
| A new tool or feature | Minor: 2.0.0 → 2.1.0 |
| Only fixes | Patch: 2.0.0 → 2.0.1 |

## Cut a release

Maintainers only.

1. Switch to `main` and update it: `git switch main`, then `git pull --ff-only`.
2. Run `npm run release -- minor`. Use `major`, `patch` or an exact version such as `2.1.0` instead when that fits.
3. Read the new section in `CHANGELOG.md`. To change the wording, edit it and run `git commit --amend -s`.
4. Push the branch the script made: `git push -u origin release/v2.1.0`.
5. Open the pull request: `gh pr create --fill`.
6. Merge it.

The script stops without changing anything if `main` is out of date, the working tree has changes, or nothing is listed under "Unreleased".

## What the merge does

- Cloudflare deploys `main`, as for any merge.
- The Release workflow (`.github/workflows/release.yml`) tags the merge commit `v2.1.0` and publishes a GitHub Release with that version's notes from `CHANGELOG.md`.
- Every page's footer shows "Version 2.1.0", linked to those notes.

## Find a version

- **Every release:** the repository's Releases page. Each release shows its notes, its tag and its commit.
- **What is live:** the footer of any page. Changes merged after the last release are live too; they are listed under "Unreleased" in `CHANGELOG.md`.
- **What changed between two versions:** the "All changes" link at the end of each release, or `git log v2.0.0..v2.1.0`.

## Go back to a version

1. On the release's page, note its commit.
2. In Cloudflare, open Workers & Pages → **freethetools** → **Deployments**.
3. Find the deployment built from that commit, and choose **Rollback**. The site switches at once, without a rebuild.
4. Undo the cause on `main`, so the next deploy doesn't bring it back: open the merged pull request that caused the problem and press **Revert**. Merge the pull request that GitHub opens.

The stats database is not rolled back. Its migrations only add columns and tables, so an older version still works with it.
