# Contributing to StackWarden

StackWarden uses Trunk Based Development. `main` is the only long-lived branch and must remain releasable.

## Start a change

Update `main`, then create one short-lived branch for one coherent change:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-kebab-description
```

Allowed branch prefixes are `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, and `revert`. An issue number is optional: `fix/123-null-output`.

Do not create `develop`, `staging`, `release/*`, or other long-lived integration branches. Keep branches under two working days when possible. Split larger work behind backward-compatible seams or disabled feature flags.

## Commit convention

Every commit and PR title follows Conventional Commits:

```txt
type(scope): lowercase description
```

Examples:

```txt
feat(cli): add repository policy checks
fix(config): handle an empty workspace list
docs: explain local installation
feat!: remove deprecated JSON fields
```

Subjects are limited to 100 characters. Allowed types match the branch prefixes above. Use `!` for a breaking change and explain it in the commit body with `BREAKING CHANGE:`.

## Local guardrails

Install the tracked hooks once per clone:

```bash
npm run hooks:install
```

The `commit-msg` hook validates commit messages. The `pre-push` hook validates the current branch name. GitHub Actions repeats both checks, validates every commit and the PR title, and runs the test suite, so local hooks are a fast feedback mechanism rather than the only control.

## Integrate into the trunk

1. Rebase or update from `main` before review when the branch is stale.
2. Open a small PR with a Conventional Commit title.
3. Merge only when required checks pass.
4. Squash merge and delete the topic branch.
5. Release Please derives the changelog and versions from the squash commit on `main`.

Prefer several independently releasable PRs over one long-running branch. If a change cannot be safely exposed yet, merge dormant code behind a feature flag rather than maintaining a parallel integration branch.