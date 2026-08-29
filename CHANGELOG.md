# Changelog

All notable changes to Pilestack are documented in this file. Format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Stack inference: a GitHub App that reads a repository's open PRs and groups
  them into stacks purely from each PR's base/head branch relationship — no
  bespoke integration with git-spice, git-town, or any other stacking CLI
  needed, since the base field is the same signal those tools already write.
- A stack view showing every PR in a stack, bottom to top, with live CI and
  review status.
- Cross-PR stack comments: a comment thread attached to the stack itself,
  visible from every PR in it — the one thing GitHub's own UI has no
  equivalent for.
- Restack: rebases and force-pushes (`--force-with-lease`) every open PR in a
  stack onto its correct base, with a mandatory diff preview and confirmation
  before anything is pushed. Stops at the first conflicting branch rather
  than leaving a partial, silently-broken push.
- GitHub OAuth sign-in; stack visibility is checked against the viewer's real
  GitHub repo permissions, not a separate Pilestack role.
- SQLite by default (zero extra infrastructure to self-host); a Dockerfile
  and `docker-compose.yml` for a one-command deploy.
- `pnpm seed` populates a realistic sample stack so the UI can be tried
  without connecting a real GitHub App first.

[Unreleased]: https://github.com/Laaaaksh/pilestack/commits/master
