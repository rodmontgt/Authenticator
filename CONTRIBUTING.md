# Contributing to this fork

This fork uses [Common Changelog](https://common-changelog.org/) and reviews changes through GitHub pull requests targeting `dev`.

## Pull requests

1. Start a topic branch from the latest `dev`; do not commit feature work directly to `dev`.
2. Keep each pull request focused on a reviewable change. Describe the problem, resulting behavior, validation and remaining limitations.
3. Use short, imperative commit titles that describe the change in plain language.
4. Run the checks relevant to the change. For cloud backups, run `npm run test:cloud` and `npm run build:browsers`.
5. Open a draft pull request while configuration or verification is incomplete. Include links to relevant documentation and state explicitly whether real OAuth accounts have been tested.
6. Record noteworthy changes in `docs/release-notes/next.md`, linking each item to its commit or pull request. Group related changes; omit formatting and routine maintenance.
7. Request review when the change is ready. Merge and publication require the repository owner's authorization; creating a pull request does not authorize either action.

Do not commit generated extensions, dependencies, local OAuth configuration, `.env` files, account tokens or secrets. Use the example configuration files documented in [CLOUD_BACKUP.md](CLOUD_BACKUP.md).

## Changelog and releases

`CHANGELOG.md` records this fork's published releases. It starts without release entries because this fork has not published a release of these changes. Do not invent a version, publication date, tag or history for the upstream project.

Common Changelog does **not** use an `Unreleased` section. `docs/release-notes/next.md` is a working draft outside the published changelog, not a released version. Prepare the final entry as part of a release pull request:

- Choose a Semantic Versioning version appropriate to the final change set, including any breaking changes. Use the extension manifest version as the release version; the root package version currently describes the build project and must not be mistaken for a published extension version.
- Add a heading `## [VERSION] - YYYY-MM-DD`, using the actual release date; put newer versions first.
- Use only `Changed`, `Added`, `Removed`, and `Fixed`, in that order, omitting empty groups.
- Write each change as one concise, self-contained bullet starting with an imperative verb. Order breaking changes first, then by importance.
- Prefix breaking changes with `**Breaking:**` and include a parenthesized Markdown link to a relevant PR or commit on every bullet.
- If an upgrade guide is required, put one single-sentence notice immediately after the version heading and keep detailed instructions in the guide.
- Link the version to the corresponding GitHub release. Commit the entry before creating its matching `vVERSION` tag.
- Publish the same release notes in the GitHub release. Remove the released items from the pending draft while keeping any items deferred to another release.

The first release requires a version decision for the OAuth configuration change: Google Drive now requires a separately configured OAuth service, and existing cloud sessions must reconnect. Do not silently treat that migration as a compatible patch.

The inherited release and tagging workflows are not a publication procedure for this fork yet; review their configuration before authorizing a release. This change does not create a tag, release or store submission.
