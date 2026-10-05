const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const ts = require("typescript");

function harness(initial = {}) {
  const settings = { ...initial };
  const UserSettings = {
    items: { ...settings },
    async updateItems() {
      this.items = { ...settings };
    },
    async commitItems() {
      for (const key of Object.keys(settings)) delete settings[key];
      Object.assign(settings, this.items);
    },
  };
  const requests = [];
  const redirect = "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/";
  const credentials = {
    drive: {
      client_id: "google-test",
      token_broker_url: "https://broker.example",
    },
    onedrive: { client_id: "microsoft-test" },
  };
  const context = {
    crypto: webcrypto,
    URL,
    URLSearchParams,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    btoa,
    console,
    chrome: {
      runtime: {},
      identity: {
        getRedirectURL: () => redirect,
        launchWebAuthFlow(options, callback) {
          const auth = new URL(options.url);
          context.authUrl = auth;
          callback(
            `${redirect}?state=${auth.searchParams.get(
              "state"
            )}&code=code%2Bwith%2Fescaping`
          );
        },
      },
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
        }),
      };
    },
  };
  const cache = {};
  const stubs = {
    settings: { UserSettings },
    credentials: { getCredentials: () => credentials },
    encryption: {},
    storage: {
      EntryStorage: {
        backupGetExport: async (encryption, encrypted) => {
          context.exportCall = { encryption, encrypted };
          return { encrypted, test: "backup-data" };
        },
      },
    },
    vue: { default: { extend: (value) => value } },
  };
  function load(name) {
    if (stubs[name]) return stubs[name];
    if (cache[name]) return cache[name];
    const filename = name.endsWith(".vue")
      ? path.resolve(name)
      : path.resolve("src/models", name + ".ts");
    let code = fs.readFileSync(filename, "utf8");
    if (name.endsWith(".vue"))
      code = code.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
    const compiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const module = { exports: {} };
    cache[name] = module.exports;
    vm.runInNewContext(
      compiled,
      {
        ...context,
        exports: module.exports,
        require: (request) =>
          load(request === "vue" ? "vue" : path.basename(request)),
      },
      { filename }
    );
    return module.exports;
  }
  return {
    context,
    settings,
    requests,
    credentials,
    UserSettings,
    load,
    redirect,
  };
}

test("Manifests permit Microsoft token requests for organizational tenants", () => {
  for (const browser of ["chrome", "edge"]) {
    const manifest = JSON.parse(
      fs.readFileSync(`manifests/manifest-${browser}.json`, "utf8")
    );
    assert.ok(
      manifest.optional_host_permissions.includes(
        "https://graph.microsoft.com/*"
      )
    );
    assert.ok(
      manifest.optional_host_permissions.includes(
        "https://login.microsoftonline.com/*"
      )
    );
    const policy = manifest.content_security_policy.extension_pages;
    assert.match(
      policy,
      /(?:^| )https:\/\/login\.microsoftonline\.com\/(?: |;)/
    );
    assert.equal(manifest.oauth2, undefined);
  }
});

test("Broker permissions and CSP are generated for its configured origin", () => {
  for (const broker of ["http://localhost:8787", "https://oauth.example"]) {
    const h = harness();
    h.credentials.drive.token_broker_url = broker;
    const expected = `${new URL(broker).protocol}//${
      new URL(broker).hostname
    }/*`;
    assert.ok(h.load("cloud-auth").cloudOrigins("drive").includes(expected));
    let output;
    const module = { exports: {} };
    const fakeFs = {
      readFileSync: () =>
        fs.readFileSync("manifests/manifest-chrome.json", "utf8"),
      writeFileSync: (_, value) => {
        output = JSON.parse(value);
      },
    };
    function loader(name) {
      return name === "fs" ? fakeFs : { drive: { token_broker_url: broker } };
    }
    vm.runInNewContext(
      fs.readFileSync("scripts/configure-cloud-manifest.js", "utf8"),
      { require: loader, module, URL }
    );
    module.exports.configureManifest("manifest.json");
    assert.ok(output.optional_host_permissions.includes(expected));
    assert.ok(
      output.content_security_policy.extension_pages.includes(
        `connect-src ${broker} `
      )
    );
  }
});

test("Business OAuth sends the code, redirect and PKCE verifier without a secret", async () => {
  const h = harness();
  const auth = h.load("cloud-auth");
  await auth.connectCloud("onedrive", true);
  assert.match(h.context.authUrl.pathname, /organizations/);
  assert.match(
    h.context.authUrl.searchParams.get("scope"),
    /Files.ReadWrite.AppFolder/
  );
  const request = h.requests[0];
  const body = new URLSearchParams(request.init.body);
  assert.equal(body.get("code"), "code+with/escaping");
  assert.equal(body.get("redirect_uri"), h.redirect);
  assert.equal(body.has("client_secret"), false);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(
    await auth.pkceChallenge(body.get("code_verifier")),
    h.context.authUrl.searchParams.get("code_challenge")
  );
  assert.equal(h.settings.oneDriveBusiness, true);
  assert.equal(h.settings.oneDriveRefreshToken, "refresh");
});

test("Google uses a verifier-bound ticket and clears the previous account folder", async () => {
  const h = harness({
    driveFolder: "old-folder",
    driveRefreshToken: "old-refresh",
  });
  h.context.chrome.identity.launchWebAuthFlow = (options, callback) => {
    const url = new URL(options.url);
    h.context.authUrl = url;
    callback(
      `${h.redirect}?state=${url.searchParams.get(
        "state"
      )}&ticket=one-time-ticket`
    );
  };
  const auth = h.load("cloud-auth");
  await auth.connectCloud("drive");
  assert.equal(h.context.authUrl.origin, "https://broker.example");
  const body = JSON.parse(h.requests[0].init.body);
  assert.equal(body.ticket, "one-time-ticket");
  assert.equal(
    await auth.pkceChallenge(body.code_verifier),
    h.context.authUrl.searchParams.get("code_challenge")
  );
  assert.equal(h.settings.driveFolder, undefined);
  assert.equal(h.settings.driveRefreshToken, "refresh");
});

test("A refresh completing after logout does not restore the account", async () => {
  const h = harness({ oneDriveRefreshToken: "old-refresh" });
  let finish;
  let started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  h.context.fetch = async () => {
    started();
    return new Promise((resolve) => {
      finish = () =>
        resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "access",
            refresh_token: "rotated",
            expires_in: 3600,
          }),
        });
    });
  };
  const auth = h.load("cloud-auth");
  const pending = auth.getCloudToken("onedrive");
  await waiting;
  await auth.disconnectCloud("onedrive");
  finish();
  assert.equal(await pending, undefined);
  assert.equal(h.settings.oneDriveToken, undefined);
  assert.equal(h.settings.oneDriveRefreshToken, undefined);
});

test("State mismatch rejects authentication without exchanging the code", async () => {
  const h = harness({ oneDriveBusiness: false, oneDriveToken: "old" });
  h.context.chrome.identity.launchWebAuthFlow = (_, callback) =>
    callback(`${h.redirect}?state=wrong&code=bad`);
  await assert.rejects(
    h.load("cloud-auth").connectCloud("onedrive", true),
    /Invalid authentication/
  );
  assert.equal(h.requests.length, 0);
  assert.equal(h.settings.oneDriveToken, "old");
  assert.equal(h.settings.oneDriveBusiness, false);
});

test("Concurrent refreshes share a request and persist rotated refresh tokens", async () => {
  const h = harness({
    oneDriveBusiness: true,
    oneDriveToken: "expired",
    oneDriveRefreshToken: "refresh-old",
  });
  const auth = h.load("cloud-auth");
  const results = await Promise.all([
    auth.getCloudToken("onedrive"),
    auth.getCloudToken("onedrive"),
  ]);
  assert.deepEqual(results, ["access", "access"]);
  assert.equal(h.requests.length, 1);
  assert.equal(h.settings.oneDriveRefreshToken, "refresh");
  assert.match(h.requests[0].url, /organizations/);
});

test("401 refreshes the session once and retries the API request", async () => {
  const h = harness({
    driveToken: "old",
    driveRefreshToken: "refresh-old",
    driveTokenExpiresAt: Date.now() + 3600000,
  });
  h.context.fetch = async (url, init) => {
    h.requests.push({ url, init });
    if (url.endsWith("/google/refresh"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "new", expires_in: 3600 }),
      };
    const valid = init.headers.Authorization === "Bearer new";
    return {
      ok: valid,
      status: valid ? 200 : 401,
      json: async () => (valid ? { id: "file" } : { error: { code: 401 } }),
    };
  };
  const result = await h
    .load("cloud-auth")
    .cloudRequest("drive", "https://www.googleapis.com/drive/v3/files");
  assert.equal(result.id, "file");
  assert.equal(h.requests.length, 3);
  assert.equal(h.settings.driveRefreshToken, "refresh-old");
});

test("Transient refresh errors preserve the account; invalid_grant disconnects it", async () => {
  for (const error of ["temporarily_unavailable", "invalid_grant"]) {
    const h = harness({
      oneDriveToken: "old",
      oneDriveRefreshToken: "refresh",
    });
    h.context.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error }),
    });
    const promise = h.load("cloud-auth").getCloudToken("onedrive");
    if (error === "invalid_grant") {
      assert.equal(await promise, undefined);
      assert.equal(h.settings.oneDriveRevoked, true);
      assert.equal(h.settings.oneDriveRefreshToken, undefined);
    } else {
      await assert.rejects(promise, /temporarily_unavailable/);
      assert.equal(h.settings.oneDriveRefreshToken, "refresh");
    }
  }
});

test("Business backups use the app folder and unique filenames without overwriting", async () => {
  const h = harness({
    oneDriveToken: "valid",
    oneDriveTokenExpiresAt: Date.now() + 3600000,
    oneDriveBusiness: true,
  });
  h.context.fetch = async (url, init) => {
    h.requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: url.endsWith("approot") ? "folder" : "file" }),
    };
  };
  const provider = new (h.load("cloud-backup").OneDrive)();
  const encryption = { test: true };
  assert.equal(await provider.upload(encryption), true);
  assert.equal(await provider.upload(encryption), true);
  const uploads = h.requests.filter((request) => request.init.method === "PUT");
  assert.equal(uploads.length, 2);
  assert.notEqual(uploads[0].url, uploads[1].url);
  assert.match(uploads[0].url, /\/items\/folder:/);
  assert.equal(JSON.parse(uploads[0].init.body).encrypted, true);
  assert.equal(h.context.exportCall.encryption, encryption);
});

test("Graph permission failures settle instead of leaving a pending promise", async () => {
  const h = harness({
    oneDriveToken: "valid",
    oneDriveTokenExpiresAt: Date.now() + 3600000,
  });
  h.context.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { code: "accessDenied" } }),
  });
  await assert.rejects(
    new (h.load("cloud-backup").OneDrive)().upload({}),
    /403, accessDenied/
  );
});

test("Drive recovers a deleted folder and uploads a valid multipart backup", async () => {
  const h = harness({
    driveToken: "valid",
    driveTokenExpiresAt: Date.now() + 3600000,
    driveFolder: "deleted",
  });
  h.context.fetch = async (url, init) => {
    h.requests.push({ url, init });
    if (url.includes("/deleted?"))
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 404 } }),
      };
    const data = url.includes("uploadType")
      ? { id: "uploaded" }
      : init.method === "POST"
      ? { id: "new-folder" }
      : { files: [] };
    return { ok: true, status: 200, json: async () => data };
  };
  assert.equal(await new (h.load("cloud-backup").Drive)().upload({}), true);
  assert.equal(h.settings.driveFolder, "new-folder");
  const upload = h.requests.find((request) =>
    request.url.includes("uploadType")
  );
  assert.match(upload.init.body, /\r\nContent-Type: application\/json/);
  assert.match(upload.init.body, /"parents":\["new-folder"\]/);
  assert.equal(
    JSON.parse(upload.init.body.split("\r\n\r\n")[2].split("\r\n--")[0])
      .encrypted,
    true
  );
});

test("OneDrive encryption control changes only OneDrive settings", async () => {
  const h = harness({ driveEncrypted: false, oneDriveEncrypted: true });
  const page = h.load("src/components/Popup/OneDrivePage.vue").default;
  const changes = [];
  const instance = {
    $store: {
      state: { backup: { oneDriveEncrypted: true } },
      commit: (...args) => changes.push(args),
    },
  };
  assert.equal(page.computed.isEncrypted.get.call(instance), "true");
  page.computed.isEncrypted.set.call(instance, "false");
  assert.equal(h.UserSettings.items.oneDriveEncrypted, false);
  assert.equal(h.UserSettings.items.driveEncrypted, false);
  assert.deepEqual(JSON.parse(JSON.stringify(changes)), [
    ["backup/setEnc", { service: "onedrive", value: false }],
  ]);
});
