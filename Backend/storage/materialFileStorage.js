/**
 * 教材本體檔案的 storage 相容層。
 *
 * **canonical 實作已移到 `storage/privateFileStorage.js`**（namespace 化的私有儲存，
 * 教材檔案與付款憑證共用同一份 filesystem primitives —— 理由見那份檔案的開頭）。
 *
 * 這個模組保留原有的匯出名稱與語意，讓既有的教材程式碼與測試不需要跟著改：
 *   - `KEY_PREFIX` / `newStorageKey()` / `isValidStorageKey()` 都**只認 material 命名空間**
 *   - `LocalMaterialFileStorage` 是綁定該 namespace 的 driver（`put()` 不必傳 namespace）
 *
 * 新程式碼請直接用 `storage/privateFileStorage.js`。
 */

const {
  NAMESPACES,
  LocalPrivateFileStorage,
  isValidStorageKey: isValidPrivateStorageKey,
  newStorageKey: newPrivateStorageKey,
} = require("./privateFileStorage");

/** storage key 的前綴。key 形如 `material-files/<uuid>`，opaque、無語意。 */
const KEY_PREFIX = `${NAMESPACES.MATERIAL_FILES}/`;

/** 只接受教材命名空間的 key —— 憑證的 key 不該被教材交付路徑當成合法輸入。 */
function isValidStorageKey(key) {
  return isValidPrivateStorageKey(key, NAMESPACES.MATERIAL_FILES);
}

function newStorageKey() {
  return newPrivateStorageKey(NAMESPACES.MATERIAL_FILES);
}

/** 綁定 `material-files` namespace 的 local driver。 */
class LocalMaterialFileStorage extends LocalPrivateFileStorage {
  constructor({ root }) {
    super({ root, defaultNamespace: NAMESPACES.MATERIAL_FILES });
  }
}

module.exports = {
  KEY_PREFIX,
  isValidStorageKey,
  newStorageKey,
  LocalMaterialFileStorage,
};
