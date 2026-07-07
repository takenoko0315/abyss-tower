// メタ進行の永続化。Claude artifacts の window.storage があればそれを、無ければ localStorage を使う

export const metaStorageLoad = async () => {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get("abyss-meta");
      if (r && r.value) return JSON.parse(r.value);
    } else if (typeof window !== "undefined" && window.localStorage) {
      const v = window.localStorage.getItem("abyss-meta");
      if (v) return JSON.parse(v);
    }
  } catch (e) { /* 初回はキーが無いため正常 */ }
  return null;
};

export const metaStorageSave = async (m) => {
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set("abyss-meta", JSON.stringify(m));
    } else if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("abyss-meta", JSON.stringify(m));
    }
  } catch (e) { /* 保存失敗時は今セッション内のみ有効 */ }
};
