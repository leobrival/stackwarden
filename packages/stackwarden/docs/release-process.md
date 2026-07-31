# Release process

StackWarden follows Trunk Based Development and continuous delivery. `main` is the only long-lived branch and must remain releasable. Release Please turns the Conventional Commits merged into `main` into a version proposal, `CHANGELOG.md` update, Git tag, and GitHub Release.

## Release contract

- Versioning follows Semantic Versioning.
- Tags and GitHub Releases use `vMAJOR.MINOR.PATCH`.
- Release Please is the only tool allowed to edit the package version and generated release sections in `CHANGELOG.md`.
- Release branches and manually created version commits are not used.
- A release is immutable. A defect in a published version is fixed by a new patch release; tags are never moved or overwritten.

## Version impact

| Change | Conventional Commit | Stable impact | Before 1.0 |
| --- | --- | --- | --- |
| User-visible capability | `feat(scope): description` | minor | minor |
| User-visible correction | `fix(scope): description` | patch | patch |
| Performance improvement | `perf(scope): description` | patch | patch |
| Breaking API or CLI change | `type(scope)!: description` plus a `BREAKING CHANGE:` footer | major | minor |
| Revert | `revert(scope): description` | patch when it reverts a releasable change | patch |
| Documentation, tests, build, CI, refactor, maintenance | `docs`, `test`, `build`, `ci`, `refactor`, `chore` | no release by default | no release by default |

Use a release override only for an intentional exception:

```txt
chore: prepare compatibility release

Release-As: 0.3.0
```

The override must be explained in the PR body and approved like any other release-affecting change.

## Changelog convention

`CHANGELOG.md` is generated from commits on `main`. Entries are grouped into Features, Bug Fixes, Performance Improvements, Reverts, Documentation, Code Refactoring, and Build System. Internal test, CI, and maintenance commits remain hidden to keep the public changelog useful.

Write the subject from the user's point of view and make the scope identify the affected surface:

```txt
feat(cli): add JSON output for audit results
fix(config): preserve explicit zero thresholds
perf(scan): avoid reading ignored directories
```

Do not use vague subjects such as `fix stuff`, `update`, or `misc changes`. Put migration guidance in the commit body and use the breaking-change syntax when users must change their configuration, CLI invocation, or API integration.

## Continuous release flow

1. Merge a small, green PR into `main` using a Conventional Commit squash title.
2. The `Release Please` workflow creates or updates one release PR.
3. Review the release PR as the release candidate:
   - version matches the commit impact;
   - changelog is complete, understandable, and contains no internal or sensitive detail;
   - `bun run release:check` passes from the repository root;
   - breaking changes include migration instructions;
   - the release contains only changes already integrated into `main`.
4. Merge the release PR when it represents a coherent user-visible increment. There is no fixed release day; avoid holding completed fixes for an artificial train.
5. Release Please creates the tag and GitHub Release from the merge.
6. Verify the tag, GitHub Release, generated notes, and the post-merge workflow before announcing completion.

For an urgent correction, merge the fix PR and then the resulting release PR as soon as checks pass. Do not create a hotfix branch.

## Release readiness checklist

Definition of Done for every release:

- [ ] The release PR is based on the latest `main` and required checks are green.
- [ ] `bun run release:check` passes from a clean checkout.
- [ ] The proposed version follows the table above.
- [ ] Changelog entries describe user impact and links resolve.
- [ ] Breaking changes contain migration and rollback guidance.
- [ ] No secret, customer identifier, or internal-only information appears in release notes.
- [ ] The Git tag and GitHub Release were created by Release Please.
- [ ] The release workflow succeeded after the release PR merge.

## Rollback and recovery

Do not rewrite or delete a published tag. If a release is defective:

1. Document the affected version and impact in an issue.
2. Revert the offending PR or merge a forward fix through the normal TBD flow.
3. Let Release Please propose the next patch version.
4. Merge and verify that patch release.
5. Mark the defective GitHub Release as deprecated in its notes when users need an explicit warning.

## npm publication roadmap

The `stackwarden` package is not currently published on npm. GitHub Releases are therefore the authoritative distribution record today.

Add npm publication only in a dedicated, reviewable PR after all of these prerequisites are met:

1. Confirm the final package name and ownership on npm.
2. Add provenance-enabled npm trusted publishing from GitHub Actions; do not store a long-lived npm token when OIDC is available.
3. Publish only after Release Please reports that it created a release.
4. Run `npm pack --dry-run` and a clean install/CLI smoke test before publishing.
5. Protect the npm environment with explicit GitHub environment rules.
6. Verify the package version and provenance on npm after publication.

Until that work lands, the release workflow must not claim that a GitHub Release also published an npm package.
