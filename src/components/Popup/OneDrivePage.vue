<template>
  <div>
    <div>
      <div class="text warning" v-if="authError">{{ authError }}</div>
      <div
        class="text warning"
        v-show="isEncrypted === 'false' || !defaultEncryption"
      >
        {{ i18n.dropbox_risk }}
      </div>
      <div v-show="backupToken">
        <div style="margin: 10px 0px 0px 20px; overflow-wrap: break-word">
          {{ i18n.account }} - {{ email }}
        </div>
      </div>
      <a-select-input
        v-show="!!defaultEncryption && backupToken"
        :label="i18n.encrypted"
        v-model="isEncrypted"
      >
        <option value="true">{{ i18n.yes }}</option>
        <option value="false">{{ i18n.no }}</option>
      </a-select-input>
      <a-button v-show="backupToken" @click="backupLogout()">
        {{ i18n.log_out }}
      </a-button>
      <a-button v-show="!backupToken" @click="getBackupToken()">
        {{ i18n.sign_in }}
      </a-button>
      <a-button v-show="!backupToken" @click="getBackupToken(true)">
        {{ i18n.sign_in_business }}
      </a-button>
      <div class="text" v-show="!backupToken">
        <a
          v-on:click="openLink('https://otp.ee/onedriveperms')"
          href="https://otp.ee/onedriveperms"
          >{{ i18n.onedrive_business_perms }}</a
        >
      </div>
      <a-button v-show="backupToken" @click="backupUpload()">
        {{ i18n.manual_dropbox }}
      </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { disconnectCloud } from "../../models/cloud-auth";
import { OneDrive } from "../../models/backup";
import { UserSettings } from "../../models/settings";

const service = "onedrive";

export default Vue.extend({
  data: function () {
    return {
      email: this.i18n.loading,
      authError: "",
    };
  },
  computed: {
    defaultEncryption: function () {
      return this.$store.state.accounts.defaultEncryption;
    },
    isEncrypted: {
      get(): string {
        return String(this.$store.state.backup.oneDriveEncrypted);
      },
      set(newValue: string) {
        const value = newValue === "true";
        UserSettings.items.oneDriveEncrypted = value;
        UserSettings.commitItems();
        this.$store.commit("backup/setEnc", { service, value });
      },
    },
    backupToken: function () {
      return this.$store.state.backup.oneDriveToken;
    },
  },
  methods: {
    openLink(url: string) {
      window.open(url, "_blank");
      return;
    },
    getBackupToken(business = false) {
      this.authError = "";
      chrome.runtime.sendMessage(
        { action: service, business },
        async (response) => {
          if (chrome.runtime.lastError) {
            this.authError =
              "Sign-in could not finish. Reopen the extension to check its status.";
            return;
          }
          if (!response?.success) {
            this.authError = response?.error || "Sign-in could not finish.";
            return;
          }
          this.$store.commit("backup/setToken", { service, value: true });
          await UserSettings.updateItems();
          try {
            this.email = await this.getUser();
          } catch {
            this.email = "";
          }
        }
      );
    },
    async backupLogout() {
      await disconnectCloud(service);
      this.$store.commit("backup/setToken", { service, value: false });
      this.$store.commit("style/hideInfo");
    },
    async backupUpload() {
      this.authError = "";
      try {
        const provider = new OneDrive();
        const response = await provider.upload(
          this.$store.state.accounts.encryption.get(this.defaultEncryption)
        );
        this.$store.commit(
          "notification/alert",
          response ? this.i18n.updateSuccess : this.i18n.updateFailure
        );
      } catch (error) {
        this.authError =
          error instanceof Error ? error.message : this.i18n.updateFailure;
        if (UserSettings.items.oneDriveRevoked)
          this.$store.commit("backup/setToken", { service, value: false });
      }
    },
    async getUser() {
      const oneDrive = new OneDrive();
      return await oneDrive.getUser();
    },
  },
  mounted: async function () {
    await UserSettings.updateItems();
    if (UserSettings.items.cloudBackupErrorService === service)
      this.authError = UserSettings.items.cloudBackupError || "";
    if (this.backupToken) {
      try {
        this.email = await this.getUser();
      } catch (error) {
        this.authError =
          error instanceof Error ? error.message : this.i18n.updateFailure;
        if (UserSettings.items.oneDriveRevoked)
          this.$store.commit("backup/setToken", { service, value: false });
      }
    }
  },
});
</script>
