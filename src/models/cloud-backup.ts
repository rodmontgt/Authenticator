import { Encryption } from "./encryption";
import { UserSettings } from "./settings";
import { EntryStorage } from "./storage";
import { CloudError, CloudService, cloudRequest } from "./cloud-auth";

async function backupData(service: CloudService, encryption: Encryption) {
  await UserSettings.updateItems();
  const key = service === "drive" ? "driveEncrypted" : "oneDriveEncrypted";
  if (UserSettings.items[key] === undefined) {
    UserSettings.items[key] = true;
    await UserSettings.commitItems();
  }
  return JSON.stringify(
    await EntryStorage.backupGetExport(
      encryption,
      UserSettings.items[key] === true
    ),
    null,
    2
  );
}

function backupName() {
  return `Authenticator-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}-${crypto.randomUUID()}.json`;
}

export class Drive implements BackupProvider {
  private async getFolder(): Promise<string> {
    await UserSettings.updateItems();
    const cached = UserSettings.items.driveFolder;
    if (cached) {
      try {
        const folder = await cloudRequest(
          "drive",
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            cached
          )}?fields=id,trashed,mimeType`
        );
        if (
          !folder.trashed &&
          folder.mimeType === "application/vnd.google-apps.folder"
        )
          return cached;
      } catch (error) {
        if (!(error instanceof CloudError) || error.status !== 404) throw error;
      }
    }
    const query = new URLSearchParams({
      q:
        "name = 'Authenticator Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id)",
      pageSize: "100",
    });
    const existing = await cloudRequest(
      "drive",
      `https://www.googleapis.com/drive/v3/files?${query}`
    );
    const folder =
      existing.files?.[0] ||
      (await cloudRequest(
        "drive",
        "https://www.googleapis.com/drive/v3/files?fields=id",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Authenticator Backups",
            mimeType: "application/vnd.google-apps.folder",
          }),
        }
      ));
    if (!folder.id)
      throw new Error("Google Drive did not return a backup folder.");
    await UserSettings.updateItems();
    UserSettings.items.driveFolder = folder.id;
    await UserSettings.commitItems();
    return folder.id;
  }

  async upload(encryption: Encryption) {
    const backup = await backupData("drive", encryption);
    const folder = await this.getFolder();
    const boundary = `authenticator_${crypto.randomUUID()}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({ name: backupName(), parents: [folder] }),
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      backup,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const file = await cloudRequest(
      "drive",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      }
    );
    return Boolean(file.id);
  }

  async getUser() {
    const result = await cloudRequest(
      "drive",
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)"
    );
    return (
      result.user?.emailAddress || result.user?.displayName || "Google Drive"
    );
  }
}

export class OneDrive implements BackupProvider {
  async upload(encryption: Encryption) {
    const backup = await backupData("onedrive", encryption);
    // AppFolder is supported for both personal and work/school OneDrive.
    const folder = await cloudRequest(
      "onedrive",
      "https://graph.microsoft.com/v1.0/me/drive/special/approot"
    );
    if (!folder.id)
      throw new Error(
        "OneDrive did not return an application folder. Check that OneDrive is provisioned for this account."
      );
    const file = await cloudRequest(
      "onedrive",
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(
        folder.id
      )}:/${encodeURIComponent(backupName())}:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: backup,
      }
    );
    return Boolean(file.id);
  }

  async getUser() {
    const user = await cloudRequest(
      "onedrive",
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName"
    );
    return (
      user.mail || user.userPrincipalName || user.displayName || "OneDrive"
    );
  }
}
