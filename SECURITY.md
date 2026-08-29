# Security Policy

## Supported versions

Pilestack is a young project. Security fixes are made against the **latest
release** and `master` only — please confirm you can reproduce the issue on the
newest release before reporting.

| Version        | Supported |
| -------------- | --------- |
| latest release | yes       |
| older releases | no        |

## Reporting a vulnerability

Please do **not** open a public GitHub issue for anything you believe is a
security problem.

Use GitHub's private vulnerability reporting instead:

> https://github.com/Laaaaksh/pilestack/security/advisories/new

That link reaches the maintainer privately — the report, follow-up
discussion, and any fix coordination stay confidential until a patched
release ships.

When reporting, please include:

- the Pilestack version or commit you're running
- how you're deploying it (Docker, from source) and against which database
- clear steps to reproduce

## What belongs in a report

Pilestack is a self-hosted GitHub App that authenticates as your app
installation to read pull requests and, on your explicit confirmation, rebase
and force-push branches on your behalf. Things worth reporting:

- Any way to trigger a restack (a real `git rebase` + `--force-with-lease`
  push against a real repository) without the explicit `{ confirm: true }`
  request the UI sends, or against a stack the requester doesn't have repo
  access to.
- A gap in GitHub webhook signature verification
  (`src/app/api/webhooks/github/route.ts`) that would let an unsigned or
  forged payload update the database.
- A way to read or post a stack comment, or view a stack's PRs, for a
  repository the signed-in user isn't a collaborator on
  (`src/lib/authz.ts`'s `hasRepoAccess` is the trust boundary).
- The GitHub App's private key or installation tokens, or a user's GitHub
  OAuth token, leaking into logs, error responses, or another
  installation's data.
- SQL injection or arbitrary file access through Prisma query construction
  or the restack git-clone path handling.

Out of scope:

- Reports that require you to already control the GitHub App's private key
  or a valid installation/OAuth token for the target installation — holding
  those credentials already grants the access described.
- Denial of service from a self-hoster's own misconfiguration (e.g. an
  unbounded restack loop from a malformed local git remote you control).

## Credits

Reporters who wish to be credited in a fix's release notes may say so in the
private report; otherwise reports are handled without attribution.
