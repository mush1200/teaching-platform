/**
 * 教材檔案儲存設定的相容層。
 *
 * **canonical 實作已移到 `config/privateFileStorage.js`** —— 教材本體與付款憑證共用
 * 同一個 driver、同一組 production fail-closed 檢查（理由見那份檔案的開頭）。
 *
 * 這個模組保留原有的匯出名稱，讓既有的教材程式碼不必跟著改。新程式碼請直接用
 * `config/privateFileStorage.js`。
 */

const privateStorage = require("./privateFileStorage");

module.exports = {
  DEFAULT_MAX_BYTES: privateStorage.DEFAULT_MATERIAL_MAX_BYTES,
  DEFAULT_TOKEN_TTL_SECONDS: privateStorage.DEFAULT_TOKEN_TTL_SECONDS,
  DEFAULT_ROOT: privateStorage.DEFAULT_ROOT,
  readMaxBytes: privateStorage.readMaterialFileMaxBytes,
  readTokenTtlSeconds: privateStorage.readTokenTtlSeconds,
  buildMaterialFileStorage: privateStorage.buildPrivateFileStorage,
  getMaterialFileStorage: privateStorage.getPrivateFileStorage,
  resetMaterialFileStorageForTests: privateStorage.resetPrivateFileStorageForTests,
};
