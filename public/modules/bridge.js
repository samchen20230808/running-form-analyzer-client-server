// 3.4 橋接：把 lib/ 的瀏覽器共用模組（同步副本，見 scripts/sync-legacy-modules.mjs）掛到 window.RFA 供舊全域 script 使用。
// 手寫，不由同步腳本產生。React 化後刪除。
import * as player from "./player/index.js";
import * as landmarks from "./landmarks/index.js";
import * as profiles from "./profiles/index.js";
window.RFA = Object.freeze({ player, landmarks, profiles });
