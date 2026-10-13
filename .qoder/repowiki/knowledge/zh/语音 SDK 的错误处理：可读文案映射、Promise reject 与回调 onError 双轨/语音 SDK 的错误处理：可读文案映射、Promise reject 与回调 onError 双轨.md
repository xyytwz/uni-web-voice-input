---
kind: error_handling
name: 语音 SDK 的错误处理：可读文案映射、Promise reject 与回调 onError 双轨
category: error_handling
scope:
    - '**'
source_files:
    - uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/index.js
    - uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/capability.js
    - uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/voiceRecorder.js
    - uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/realtimeAsr.js
---

## 1. 采用的方式

仓库是一个纯 JavaScript SDK（uni_modules 插件），没有后端、没有框架中间件，也没有自定义 Error 子类。错误处理采用以下组合：

- **同步/异步函数统一通过 `throw new Error(...)` 或 Promise `.reject` 向上冒泡**，调用方用 `try/catch` 或 `.catch()` 捕获。
- **浏览器原生 DOMException / navigator.permissions API 的失败被兜底 catch 后降级为字符串状态**（如 `'unknown'`、`'error'`），避免在能力探测阶段中断流程。
- **面向用户的错误文案集中翻译**：把 `NotAllowedError`、`NotFoundError`、`OverconstrainedError` 等浏览器错误名映射为中文提示。
- **网络层（WebSocket）错误通过回调 `onError(message: string)` 和 Promise reject 两条路径同时上报**。

## 2. 关键文件

| 文件 | 职责 |
|---|---|
| `uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/index.js` | 唯一对外导出入口，暴露 `describeMicError` 给上层组件使用 |
| `capability.js` | 环境探测；对不可用的 API 一律返回 null/false 或字符串状态，不抛错 |
| `voiceRecorder.js` | 录音编排器；把 getUserMedia/AudioContext 错误转成中文 Error，并驱动 ASR |
| `realtimeAsr.js` | WebSocket 实时 ASR 客户端；封装连接超时、鉴权失败、服务端错误码 |
| `pcm.js` | PCM 编解码，无错误分支 |

## 3. 架构与约定

### 3.1 能力探测层（capability.js）——“静默降级”

`isHarmonyWebview`、`isSecureContext`、`canUseWebMic`、`probeMicPermission`、`isAppPlusAndroid`、`requestRecordAudioViaPlus` 全部遵循同一模式：

- 先判 `typeof window/navigator/xxx !== 'undefined'`，不存在直接返回 false/null。
- 对可能抛错的宿主 API（如 `plus.android.requestPermissions`、`permissions.query`）用 `try/catch` 包裹，catch 后 resolve 一个安全值（`'unsupported'`、`'unknown'`、`'error'`）。
- `getMicBlockReason` 返回人类可读的原因字符串（如 `当前为非安全环境（HTTP），无法使用网页麦克风…`），供调用方直接展示。

这一层的设计目标是：**能力探测永远不抛错，只返回布尔/字符串状态**，从而让上层可以优雅降级。

### 3.2 用户可见错误文案映射（voiceRecorder.js）

`describeMicError(e)` 是唯一的“浏览器错误 → 中文文案”转换点，按 `e.name` 正则匹配：

| 匹配名 | 文案 |
|---|---|
| `NotAllowedError` / `PermissionDenied` / `SecurityError` | `麦克风权限被拒绝，请在浏览器/系统设置中允许后重试` |
| `NotFoundError` / `DevicesNotFound` | `未检测到麦克风设备` |
| `NotReadableError` / `AbortError` / `InUse` | `麦克风被其它应用占用，暂时无法录音` |
| `OverconstrainedError` | `当前设备不支持所需录音参数` |
| 其他 | 回落到 `e.message` 或 `麦克风启动失败` |

该函数由 `index.js` 重新导出，供 Vue 组件直接调用。

### 3.3 录音生命周期中的错误传播（voiceRecorder.js）

`createVoiceRecorder().start()` / `stop()` 是主要抛出点：

- 非浏览器环境：`throw new Error('[voice] 当前非浏览器/WebView 环境，无法录音')`
- 缺少 `getUserMedia`：`throw new Error(getMicBlockReason(w, n) || '当前环境不支持录音')`
- 缺少 `AudioContext`：`throw new Error('当前环境不支持音频处理（缺少 AudioContext）')`
- `getUserMedia` 失败：先清理 ASR 与音频链路，再 `throw new Error(describeMicError(e))`
- 录音太短：`throw new Error('录音时间太短，请按住说话')`
- 识别结果为空：根据是否采集到 PCM 分别抛 `未采集到音频…` 或 `未识别到内容…`

所有资源释放（`scriptProcessor.disconnect`、`mediaSourceNode.disconnect`、`audioContext.close`、`mediaStream.getTracks().forEach(t => t.stop())`）都包在独立 `try/catch { /* ignore */ }` 中，确保即使 teardown 本身抛错也不会掩盖主流程错误。

### 3.4 实时 ASR 层（realtimeAsr.js）——“回调 + Promise reject”双轨

`createRealtimeAsrClient` 通过 `handlers = { onPartial, onFinal, onError }` 回调通知业务层，同时内部 Promise 链也 reject：

- 构造时校验 `options.fetchSign` 必须是函数，否则 `throw new Error('[asr] 必须提供 options.fetchSign…')`
- 检测不到全局 `WebSocket`：`throw new Error('[asr] 当前环境没有可用的 WebSocket 实现')`
- 签名解析失败：包装为 `语音识别签名失败：${message}`
- WebSocket 连接超时（`CONNECT_TIMEOUT_MS=8000`）：`语音识别连接超时`
- WebSocket 连接失败：`语音识别连接失败，请检查网络后重试`
- 服务端错误码（`formatAsrServerError`）：
  - `4004` → `语音识别额度已用尽…`
  - `4001/4002/4003` → `语音识别鉴权失败，请重试`
  - 其他 → `语音识别失败（错误码 ${code}）`
- `recognizePcmBuffer` 整体被 `withTimeout(RECOGNIZE_TIMEOUT_MS=20000, '语音识别超时，请重试')` 包裹

`failPending(err)` 是统一的错误分发点：设置 `pendingError`、调用 `handlers.onError(err.message)`、reject 正在等待的 `recognizeReject` 与 `stopResolve`、关闭 socket。

### 3.5 并发时序中的“吞掉未处理 rejection”

`start()` 中三件事并发发起：ASR 连接、`getUserMedia`、`AudioContext` 构造。其中前两个 Promise 如果立即失败，会触发 unhandled rejection，因此代码显式 `.catch(() => undefined)` 接住：

```js
const asrReady = asr.start(asrHandlers(), { voiceFormat });
asrReady.catch(() => undefined);
const micPromise = n.mediaDevices.getUserMedia(mediaConstraints);
micPromise.catch(() => undefined);
```

随后在 `await micPromise` 处统一 catch，清理资源后再抛出中文 Error。这样既保证 user-activation 窗口不被 await 阻塞，又避免控制台出现 unhandled rejection。

## 4. 观察到的约定与约束

- **能力探测函数不抛错**：`capability.js` 中所有函数对缺失 API 一律返回 false/null/'unknown'/'unsupported'，并用 try/catch 包裹宿主 API 调用。这是可验证的——每个函数都有对应的守卫分支。
- **面向用户的错误以中文字符串形式通过 Error.message 传递**：`describeMicError`、`getMicBlockReason`、`formatAsrServerError` 以及各 `throw new Error(...)` 都产出可直接展示给用户的文案，而非仅传 code。
- **SDK 内部错误带命名空间前缀**：`[voice] …`、`[asr] …`，便于区分来源。
- **资源清理一律 try/catch 忽略异常**：`teardownAudio`、`closeSocket`、`clearStopWait` 中对 `disconnect/close` 的调用均被包裹，保证清理失败不会改变主流程语义。
- **WebSocket 错误同时走回调与 Promise reject**：`failPending` 同时调用 `handlers.onError` 和 reject 挂起的 Promise，调用方可任选其一消费。
- **没有自定义 Error 子类、没有全局 error handler、没有 panic/recover**：整个仓库是纯 JS 库，错误模型就是原生 `Error` + Promise reject + 可选回调 onError。
- **demo 侧的 Vue 组件（`components/uni-web-voice-input/uni-web-voice-input.vue`）通过 `describeMicError` 复用 SDK 的文案映射**，保持 UI 层与 SDK 层的错误文案一致。

## 5. 局限

- 没有统一的错误码枚举或结构化错误对象（如 `{ code, message, recoverable }`），错误信息以字符串为主，调用方只能通过字符串匹配判断类型。
- 没有日志级别管理，调试日志通过 `debug` 选项开关 `console.log/warn/error`。
- 没有针对特定平台（鸿蒙 ArkWeb、uni-app App-plus）的专用错误类型，差异通过能力探测函数的返回值表达。