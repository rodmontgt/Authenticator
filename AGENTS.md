# Repository instructions

## Change tracking

- Follow `CONTRIBUTING.md` and https://common-changelog.org/ for changelogs and releases.
- Keep published history in `CHANGELOG.md`. Never add an `Unreleased` section or fabricate a published version, release date, tag, PR or commit reference.
- Curate noteworthy pending changes in `docs/release-notes/next.md`; use the categories `Changed`, `Added`, `Removed`, `Fixed` in that order, imperative bullets and real PR/commit links. Mark compatibility breaks with `**Breaking:**`.
- Review release notes manually. Do not copy a commit log verbatim or include formatting-only maintenance.

## GitHub workflow

- The human has requested that changes to this fork be carried through pull requests. Work on a topic branch based on `dev`, open or update the corresponding PR in `rodmontgt/Authenticator`, and attach created PRs to the current chat.
- Prefer draft PRs until required checks and real integration verification are complete. Include outcomes and material limitations in the description.
- Do not merge a PR, create a release/tag, publish an extension, or configure branch protection without explicit human authorization.
- Preserve other work and remote history. Do not force-push or replace the base branch.
- If Git transport is unavailable, GitHub's Git Data API can create a tree and commit on a topic branch with the verified remote base SHA as its parent. Include only reviewed source/documentation files and keep the local checkout aligned with the published branch.
- Do not spawn additional agents unless the human explicitly asks for delegation.

## Verification and sensitive files

- For cloud-backup changes, run `npm run test:cloud` and `npm run build:browsers`. State clearly when providers were simulated and when real accounts have not been tested.
- Exclude `build/`, `node_modules/`, `.source-download/`, `cloud-config.local.json`, `.env` files and tokens from commits and pull requests. Example files may contain placeholders only.
- Keep Google's client secret on the OAuth server. Never bundle credentials or secrets in the browser extension.
