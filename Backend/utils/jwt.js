const jwt = require("jsonwebtoken");

/**
 * 簽發 JWT（登入成功時用）
 * payload：只放必要資訊（userId, role）
 */
/**
 * JWT signing secret — must come from the environment. There is deliberately no fallback:
 * a default baked into the source is public, so anyone could mint a token for any userId
 * and role (including admin). Validated once at module load so the process fails fast at
 * startup rather than silently running in a forgeable state.
 */
const MIN_JWT_SECRET_LENGTH = 32;
const HOW_TO_GENERATE =
  "Generate a high-entropy, randomly generated value (e.g. `openssl rand -base64 48`) " +
  "and supply it via the environment. Never hard-code or commit it.";
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  "dev-secret-change-me",
  "change-me",
  "changeme",
  "secret",
  "jwt-secret",
  "your-secret-key",
]);

function readJwtSecretFromEnv() {
  const raw = process.env.JWT_SECRET;

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw new Error(
      `JWT_SECRET is not set (or is blank). Refusing to start. ${HOW_TO_GENERATE}`
    );
  }

  const secret = String(raw);

  if (KNOWN_PLACEHOLDER_SECRETS.has(secret.trim().toLowerCase())) {
    throw new Error(
      "JWT_SECRET is a well-known placeholder value and is therefore public. " +
        `Refusing to start. ${HOW_TO_GENERATE}`
    );
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters. Refusing to start. ` +
        "Note that length alone does not make a secret safe: a long passphrase or any " +
        `guessable string is still unsafe. ${HOW_TO_GENERATE}`
    );
  }

  return secret;
}

const JWT_SECRET = readJwtSecretFromEnv();

/*
 * `PRE-12`：`JWT_EXPIRES_IN` 的格式在**載入時**就驗證。
 *
 * 先前它只在 `jwt.sign()` 被呼叫時才生效，因此一個打錯的值（實測 `"abc"`／`"7dd"`）
 * 會讓 backend **啟動成功**，卻在**第一個使用者登入**時才炸 —— 最糟的失敗時點。
 * 檢查本身在 `config/productionUrlContract.js`，與 `JWT_SECRET` 的規則互不干涉；
 * 這裡只是把它拉到與本模組相同的載入時機。
 */
require("../config/productionUrlContract").assertJwtExpiresIn();

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

/**
 * 驗證 JWT；與 signToken 使用同一把由環境提供的 secret。
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signToken,
  verifyToken,
};
