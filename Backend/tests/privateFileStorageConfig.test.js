const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildPrivateFileStorage } = require("../config/privateFileStorage");

/**
 * Driver 選擇與 **production fail-closed 矩陣**（`PRE-13`，2026-08-31）。
 *
 * ## 為什麼現在才有這支測試
 *
 * `PRE-09` 當時是以一次性探測驗過這些分支的，但**沒有留下測試**。
 * `PRE-13` 在同一個函式裡加了 `s3` 分支，而這個函式的每一條 throw 都是
 * 「寧可起不來，也不要在看起來正常、實際會遺失已售教材與付款憑證的狀態下運行」——
 * 加分支卻不把既有行為釘住，等於把那個保證交給下一次 code review 的運氣。
 *
 * **這支測試的責任是防止 fail-closed 被弱化**，包括被我自己這一輪弱化。
 */

const MANAGED_ENV = [
  "NODE_ENV",
  "PRIVATE_FILE_STORAGE_DRIVER",
  "PRIVATE_FILE_STORAGE_PATH",
  "PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION",
  "PRIVATE_FILE_STORAGE_S3_BUCKET",
  "PRIVATE_FILE_STORAGE_S3_ENDPOINT",
  "PRIVATE_FILE_STORAGE_S3_REGION",
  "PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID",
  "PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY",
  "PRIVATE_FILE_STORAGE_S3_FORCE_PATH_STYLE",
  "MATERIAL_FILE_STORAGE_DRIVER",
  "MATERIAL_FILE_STORAGE_PATH",
  "MATERIAL_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION",
];

/** 在一組乾淨的環境變數下執行 —— 只保留這個 case 明確設定的那些。 */
function withEnv(overrides, fn) {
  const saved = new Map(MANAGED_ENV.map((name) => [name, process.env[name]]));
  for (const name of MANAGED_ENV) delete process.env[name];
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    for (const name of MANAGED_ENV) delete process.env[name];
    for (const [name, value] of saved) {
      if (value !== undefined) process.env[name] = value;
    }
  }
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "storage-config-test-"));
}

const S3_ENV = {
  PRIVATE_FILE_STORAGE_DRIVER: "s3",
  PRIVATE_FILE_STORAGE_S3_BUCKET: "some-bucket",
  PRIVATE_FILE_STORAGE_S3_ENDPOINT: "https://s3.example.invalid",
  PRIVATE_FILE_STORAGE_S3_REGION: "us-west-004",
  PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID: "fake-key-id",
  PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY: "fake-secret",
};

// ---------------------------------------------------------------------------
// Driver 選擇
// ---------------------------------------------------------------------------

test("未設定 driver 時預設 local", () => {
  withEnv({ PRIVATE_FILE_STORAGE_PATH: tempRoot() }, () => {
    assert.equal(buildPrivateFileStorage().driver, "local");
  });
});

test("認不得的 driver 明確拒絕，不靜默退回 local", () => {
  withEnv({ PRIVATE_FILE_STORAGE_DRIVER: "gcs" }, () => {
    assert.throws(() => buildPrivateFileStorage(), /is not implemented/);
  });
  // 拼錯也一樣 —— 靜默退回 local 等於在 production 悄悄改用 ephemeral 磁碟。
  withEnv({ PRIVATE_FILE_STORAGE_DRIVER: "s33" }, () => {
    assert.throws(() => buildPrivateFileStorage(), /is not implemented/);
  });
});

test("canonical 與 legacy 別名值不同時拒絕啟動", () => {
  withEnv(
    {
      PRIVATE_FILE_STORAGE_DRIVER: "local",
      MATERIAL_FILE_STORAGE_DRIVER: "s3",
    },
    () => {
      assert.throws(() => buildPrivateFileStorage(), /both set to different values/);
    }
  );
});

// ---------------------------------------------------------------------------
// local driver 的 production fail-closed —— 本輪**未改動**，這裡把它釘住
// ---------------------------------------------------------------------------

test("production ＋ local ＋ 未設 PATH → 拒絕啟動", () => {
  withEnv({ NODE_ENV: "production", PRIVATE_FILE_STORAGE_DRIVER: "local" }, () => {
    assert.throws(() => buildPrivateFileStorage(), /PRIVATE_FILE_STORAGE_PATH is required/);
  });
});

test("production ＋ local ＋ 有 PATH 但未明示 opt-in → 拒絕啟動", () => {
  withEnv(
    {
      NODE_ENV: "production",
      PRIVATE_FILE_STORAGE_DRIVER: "local",
      PRIVATE_FILE_STORAGE_PATH: tempRoot(),
    },
    () => {
      assert.throws(() => buildPrivateFileStorage(), /Refusing to start/);
    }
  );
});

test("production ＋ local ＋ PATH ＋ 明示 opt-in → 允許（既有逃生口未被移除）", () => {
  withEnv(
    {
      NODE_ENV: "production",
      PRIVATE_FILE_STORAGE_DRIVER: "local",
      PRIVATE_FILE_STORAGE_PATH: tempRoot(),
      PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION: "true",
    },
    () => {
      assert.equal(buildPrivateFileStorage().driver, "local");
    }
  );
});

// ---------------------------------------------------------------------------
// s3 driver
// ---------------------------------------------------------------------------

test("driver=s3 ＋ 五個設定齊全 → 建立 s3 driver", () => {
  withEnv({ ...S3_ENV }, () => {
    const storage = buildPrivateFileStorage();
    assert.equal(storage.driver, "s3");
    assert.equal(storage.bucket, "some-bucket");
  });
});

test("driver=s3 缺任何一個必填設定 → 拒絕啟動", () => {
  const required = [
    "PRIVATE_FILE_STORAGE_S3_BUCKET",
    "PRIVATE_FILE_STORAGE_S3_ENDPOINT",
    "PRIVATE_FILE_STORAGE_S3_REGION",
    "PRIVATE_FILE_STORAGE_S3_ACCESS_KEY_ID",
    "PRIVATE_FILE_STORAGE_S3_SECRET_ACCESS_KEY",
  ];

  for (const missing of required) {
    const env = { ...S3_ENV };
    delete env[missing];
    withEnv(env, () => {
      assert.throws(
        () => buildPrivateFileStorage(),
        new RegExp(`${missing} is required`),
        `缺少 ${missing} 時應拒絕啟動`
      );
    });
    // 空白字串等同未設定 —— 不能讓一個看起來有填的空值溜過去。
    withEnv({ ...S3_ENV, [missing]: "   " }, () => {
      assert.throws(() => buildPrivateFileStorage(), new RegExp(`${missing} is required`));
    });
  }
});

test("driver=s3 在 production 不需要 PATH，也不需要 ALLOW_LOCAL_IN_PRODUCTION", () => {
  withEnv({ NODE_ENV: "production", ...S3_ENV }, () => {
    const storage = buildPrivateFileStorage();
    assert.equal(storage.driver, "s3");
  });

  // 這是 NT$0 部署的核心前提：位元組不在容器磁碟上，
  // 所以那個 opt-in 不該被需要 —— 需要它就代表還是在寫本機磁碟。
  assert.equal(
    process.env.PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION,
    undefined,
    "測試不得留下殘留的環境變數"
  );
});

test("driver=s3 時 FORCE_PATH_STYLE 預設開啟，可明確關閉", () => {
  withEnv({ ...S3_ENV }, () => {
    assert.equal(buildPrivateFileStorage().client.config.forcePathStyle, true);
  });
  withEnv({ ...S3_ENV, PRIVATE_FILE_STORAGE_S3_FORCE_PATH_STYLE: "false" }, () => {
    assert.equal(buildPrivateFileStorage().client.config.forcePathStyle, false);
  });
});
