/**
 * 跨端能力探测（framework-agnostic，纯 Web / WebView 环境）
 *
 * 背景：语音走「纯 Web 降级」（getUserMedia + WebSocket 实时 ASR）时，不同容器差异很大：
 *  - 普通浏览器 / H5：直接可用，仅需 https 或 localhost（安全上下文）。
 *  - 安卓 / iOS App 的 plus.webview：window.plus 存在。
 *  - 鸿蒙 ArkWeb <web-view>：既没有可用的原生录音桥，UA 又常被宿主 setCustomUserAgent
 *    覆写成不含 ArkWeb/OpenHarmony 关键字的 uni-app UA，因此**不能只靠 UA 判鸿蒙**。
 *
 * 关键教训：判鸿蒙用「结构化信号」而非 UA —— ArkWeb 的 <web-view> 会向页面注入
 * javaScriptProxy `window.__uniapp_x_`（安卓/iOS 的 plus.webview 不注入），命中即为鸿蒙。
 */

/** 是否运行在鸿蒙 ArkWeb <web-view> 内 */
export function isHarmonyWebview(win) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  if (!w) return false;
  // ① 鸿蒙 ArkWeb <web-view> 独有注入的 JS 代理：最强确定性信号，优先判定
  if (typeof w.__uniapp_x_ !== 'undefined') return true;
  // ② 安卓 / iOS：有 plus 即 Html5Plus 容器，绝不可能是鸿蒙 web-view
  if (typeof w.plus !== 'undefined') return false;
  // ③ UA 兜底（额外纳入 HarmonyOS，覆盖部分未覆写 UA 的变体）
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav) return /ArkWeb|OpenHarmony|HarmonyOS/i.test(nav.userAgent || '');
  return false;
}

/** 是否处于安全上下文（getUserMedia 的硬性前置：https 或 localhost） */
export function isSecureContext(win) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  if (!w) return false;
  if (typeof w.isSecureContext === 'boolean') return w.isSecureContext;
  // 兜底：部分老环境未暴露该字段，用协议判断
  try {
    return w.location.protocol === 'https:' || w.location.hostname === 'localhost';
  } catch {
    return false;
  }
}

/** 当前环境能否用网页麦克风（Web 降级路径的可用性判断） */
export function canUseWebMic(win, nav) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  const n = nav || (typeof navigator !== 'undefined' ? navigator : undefined);
  return !!w && isSecureContext(w) && !!(n && n.mediaDevices && n.mediaDevices.getUserMedia);
}

/**
 * 返回当前无法使用麦克风的原因文案（可用则返回 null）。
 * 便于调用方直接展示给用户，无需重复实现判断。
 */
export function getMicBlockReason(win, nav) {
  if (canUseWebMic(win, nav)) return null;
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  const n = nav || (typeof navigator !== 'undefined' ? navigator : undefined);
  if (w && !isSecureContext(w)) {
    return '当前为非安全环境（HTTP），无法使用网页麦克风。请改用 HTTPS 打开，或在 App 内重试。';
  }
  if (!(n && n.mediaDevices && n.mediaDevices.getUserMedia)) {
    return '当前环境不支持录音（缺少 getUserMedia）。';
  }
  return null;
}

/**
 * 异步探测麦克风授权状态（不阻塞、不消耗用户手势，建议在组件挂载时调用）。
 * 用 navigator.permissions.query；部分内核（含老 ArkWeb）不支持 'microphone'
 * 这个名字或压根没有 permissions —— 一律静默回落到 'unknown'，
 * 由调用方当作「未知」处理（继续走 getUserMedia 自然弹窗），绝不因此卡住。
 * @returns {Promise<'granted'|'denied'|'prompt'|'unknown'>}
 */
export function probeMicPermission(win, nav) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  const n = nav || (typeof navigator !== 'undefined' ? navigator : undefined);
  const perms = n && n.permissions;
  if (!w || !perms || typeof perms.query !== 'function') {
    return Promise.resolve('unknown');
  }
  return Promise.resolve()
    .then(() => perms.query({ name: 'microphone' }))
    .then((r) => (r && r.state) || 'unknown')
    .catch(() => 'unknown');
}

/**
 * 是否运行在 uni-app App-plus 的安卓 webview 内（window.plus 存在且为 android）。
 * 安卓 App-plus 下 webview 的 getUserMedia 不会自行弹系统授权框，
 * 需宿主先持有 RECORD_AUDIO——本函数用于判定是否要走 plus 补申请。
 */
export function isAppPlusAndroid(win) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  if (!w || typeof w.plus === 'undefined') return false;
  try {
    if (/android/i.test((w.plus.os && w.plus.os.name) || '')) return true;
  } catch {
    // ignore
  }
  try {
    if (/android/i.test((w.navigator && w.navigator.userAgent) || '')) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * 通过 plus.android 申请安卓录音运行时权限（android.permission.RECORD_AUDIO）。
 * 仅适用于 uni-app App-plus 容器；非 App-plus / 无 plus.android → resolve('unsupported')，
 * 调用方据此什么都不做（零副作用）。
 * @returns {Promise<'granted'|'denied'|'unsupported'|'error'>}
 */
export function requestRecordAudioViaPlus(win) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  return new Promise((resolve) => {
    try {
      const plus = w && w.plus;
      if (!plus || !plus.android || typeof plus.android.requestPermissions !== 'function') {
        resolve('unsupported');
        return;
      }
      plus.android.requestPermissions(
        ['android.permission.RECORD_AUDIO'],
        (res) => {
          const grantedList = (res && res.granted) || [];
          const denied =
            ((res && res.deniedPresent) || []).length + ((res && res.deniedAlways) || []).length;
          if (grantedList.length > 0) resolve('granted');
          else if (denied > 0) resolve('denied');
          else resolve('granted');
        },
        () => resolve('error'),
      );
    } catch {
      resolve('error');
    }
  });
}
