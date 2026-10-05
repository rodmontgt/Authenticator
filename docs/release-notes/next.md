# Pending release notes

These notes describe proposed changes to this fork and are not a published release. The release version and date will be chosen in a release pull request according to [CONTRIBUTING.md](../../CONTRIBUTING.md).

OAuth setup and migration instructions are in [CLOUD_BACKUP.md](../../CLOUD_BACKUP.md). Real-account verification is still pending.

### Changed

- **Breaking:** require an independently configured Google OAuth service and reconnect existing cloud sessions to use the fork's own applications ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))
- Preserve earlier cloud backups by assigning each new file a unique name ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))

### Added

- Support configuring Microsoft Entra applications for OneDrive Business in a specific organizational tenant ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))
- Support compiling and watching Chrome and Edge extensions on Windows without Bash ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))
- Document local installation and OAuth application setup for Google Drive and OneDrive Business ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))

### Fixed

- Repair cloud backup requests in Manifest V3 and send the authorization-code exchange parameters required by Microsoft ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))
- Renew cloud sessions, preserve rotated refresh tokens and report denied access without leaving requests pending ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))
- Apply OneDrive's encryption choice to OneDrive independently of Google Drive ([`d338da7`](https://github.com/rodmontgt/Authenticator/commit/d338da74aba78b686f82ae760b3d9e6cec70d829))

