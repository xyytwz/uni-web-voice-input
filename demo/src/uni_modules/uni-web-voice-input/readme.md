## 简介

`uni-web-voice-input` 是一个基于**纯 Web 能力**的跨端语音输入组件 + SDK：

- 采音：`getUserMedia` + Web Audio（`ScriptProcessor`）→ 实时降采样为 16k PCM16；
- 识别：原生 `WebSocket` 直连实时 ASR（默认兼容**腾讯云 ASR** `voice_format=1` 协议）；
- 后端解耦：ASR 签名通过 `getSign` / `signUrl` **注入**，组件不绑定任何具体后端与厂商密钥。

它尤其适合「H5 页面被各端 WebView（**尤其鸿蒙 ArkWeb `<web-view>`**）内嵌」的场景 —— 这些环境里原生录音桥往往不可用，只能走 Web 能力。本插件把一整套踩坑换来的**时序修复**都封装好了，开箱即用。

> 为什么强调鸿蒙：鸿蒙 ArkWeb 的 `<web-view>` 里 `plus.*` / 原生桥不可用，且 UA 常被宿主 `setCustomUserAgent` 覆写，因此不能靠 UA 判端。SDK 内置了「结构化能力探测」与「用户手势窗口内发起 `getUserMedia`」两条关键修复（详见下）。

## 平台 / 系统支持说明

本质是「纯 Web 能力」组件，能否用只取决于目标环境**是否具备网页麦克风（`getUserMedia`）与 `WebSocket`**，与是否 uni-app 无关。

| 平台 / 系统 | 支持 | 前提与说明 |
| --- | --- | --- |
| H5 · PC Chrome / Edge / Firefox | ✅ | HTTPS 或 localhost |
| H5 · PC IE | ❌ | 无 `getUserMedia` / 现代 Promise 链 |
| H5 · 安卓浏览器（含微信/QQ 浏览器） | ✅ | HTTPS；首次由按住手势触发系统授权框 |
| H5 · iOS Safari | ✅ | **iOS 14.3+**、HTTPS（`navigator.mediaDevices.getUserMedia` 自 14.3 起提供） |
| App · vue 页面 / 内嵌 webview（安卓） | ✅ | 宿主需持有 `RECORD_AUDIO`（见「安卓 / iOS 宿主集成」）；本组件挂载时会用 `plus` 自动补申请 |
| App · vue 页面 / 内嵌 webview（iOS） | ✅ | **iOS 14.3+**，且宿主 Info.plist 声明 `NSMicrophoneUsageDescription` |
| 鸿蒙 ArkWeb `<web-view>` | ✅ | 需宿主转发 `onPermissionRequest`（见「鸿蒙宿主集成」） |
| App · nvue | ❌ | nvue 无 DOM / WebAudio |
| 微信 / 支付宝 / 百度 / 字节 / QQ 小程序 | ❌ | 小程序无 `getUserMedia` |
| 快应用 | ❌ | 无网页麦克风能力 |

版本与框架约束：仅 **Vue3**（组件用 `<script setup>`，vue2 = ❌）；采音层用 `AudioContext || webkitAudioContext` 并已处理 iOS 的 `suspended → resume`；无 `navigator.webkitGetUserMedia` 老式回退，故 **iOS 下限为 14.3**。

## 安装

### 方式一：插件市场（HBuilderX）
在 HBuilderX 中打开本插件页面 → 「使用 HBuilderX 导入插件」，会自动放入 `uni_modules/uni-web-voice-input/`。uni_modules 组件为**免注册**，直接在模板里写 `<uni-web-voice-input />` 即可。

### 方式二：npm
```bash
npm i uni-web-voice-input
```
- 只用**脚本 SDK**（不含组件）：
  ```js
  import { createVoiceRecorder } from 'uni-web-voice-input'
  ```
- 用组件：把 `uni_modules/uni-web-voice-input` 拷入你项目的 `uni_modules/` 目录。

### 方式三：手动拷贝
下载本仓库，将 `uni_modules/uni-web-voice-input` 整个目录拷贝到项目的 `uni_modules/` 下。

## 快速开始

### 1）组件用法

```vue
<template>
  <uni-web-voice-input
    :get-sign="getSign"
    @result="onVoice"
    @partial="onPartial"
    @error="onError"
  />
</template>

<script setup>
// 注入签名：返回一个包含 wss url 的对象即可
const getSign = async () => {
  const res = await myApi.getAsrSign() // 你自己的后端
  return { url: res.url, expired: res.expired }
}
const onVoice = (text) => console.log('识别结果：', text)
const onPartial = (t) => console.log('实时：', t)
const onError = (msg) => uni.showToast({ title: msg, icon: 'none' })
</script>
```

也可以偷懒只给一个 `signUrl`，组件会 `GET` 它并自动解析（返回体 `{url}` 或 `{data:{url}}` 均可）：

```vue
<uni-web-voice-input sign-url="https://your.domain/api/app/ai/asr/sign" @result="onVoice" />
```

### 2）脚本 SDK 用法（自带 UI，不用组件）

```js
import { createVoiceRecorder, getMicBlockReason } from 'uni-web-voice-input'

const recorder = createVoiceRecorder({
  fetchSign: () => myApi.getAsrSign(), // { url, expired? }
  handlers: {
    onPartial: (t) => (draft.value = t),
    onFinal: (t) => (draft.value = t),
    onError: (m) => console.warn(m),
    onStateChange: (s) => (state.value = s),
  },
})

// ⚠️ 关键：必须在「按下」这次手势的同步代码里直接调用 start()，前面不要有任何 await
function onTouchStart() {
  const reason = getMicBlockReason()
  if (reason) return toast(reason)
  recorder.start().catch((e) => toast(e.message))
}

function onTouchEnd() {
  recorder
    .stop()
    .then((text) => text && send(text))
    .catch((e) => toast(e.message))
}

function onTouchCancel() {
  recorder.cancel() // 上滑取消
}
```

## 属性 / 事件

### Props（组件）
| 名称 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| getSign | Function | - | `() => Promise<{url, expired?, voiceId?}>`，签名注入（优先） |
| signUrl | String | - | 直接给一个 GET 返回签名的地址 |
| voiceFormat | Number | 1 | ASR 编码，1=16k PCM16（腾讯云） |
| cancelThreshold | Number | 80 | 上滑取消的像素阈值 |
| debug | Boolean | false | 打印 ASR/签名调试日志 |
| autoRequestAndroidPermission | Boolean | true | 安卓 App-plus 内是否在挂载时自动申请 `RECORD_AUDIO`；非 App-plus 无副作用 |

### Events（组件）
| 名称 | 回调 | 说明 |
| --- | --- | --- |
| result | `(text: string)` | 松手后最终识别文本 |
| partial | `(text: string)` | 实时中间结果 |
| error | `(message: string)` | 出错（无权限/太短/无内容/额度等可读文案） |
| state | `(state)` | 状态机：`idle/preparing/recording/recognizing/canceled` |

### VoiceRecorder（SDK）
`start()` / `stop(): Promise<string>` / `cancel()` / `getState()` / `getPartialText()` / `prefetch()`。
构造参数见 `index.d.ts`（含 `targetSampleRate`、`bufferSize`、`minDurationMs`、`mediaConstraints`、`WebSocketImpl` 等）。

## 鸿蒙宿主集成（重要）

组件/SDK 是纯前端，鸿蒙能否真正弹麦克风权限、采到音，取决于**宿主 App（ArkTS 壳）里的 WebView**：

1. **权限声明**：宿主 `module.json5` 需声明 `ohos.permission.MICROPHONE`（相机如需再加 `CAMERA`）。
2. **转发 H5 授权**：宿主的 `Web` 组件需实现 `onPermissionRequest`，把 `AUDIO_CAPTURE` 映射到 `MICROPHONE`，`requestPermissionsFromUser` 后 `request.grant()`。若宿主用的是 uni-app 运行时，需确保该 patch 在（`ohpm install` 会覆盖，需重跑打补丁脚本并重装 HAP）。
3. **HTTPS**：页面必须运行在安全上下文，否则 `getUserMedia` 直接被拦。
4. 本 SDK 已保证 `getUserMedia` 在**按下手势的同步窗口内发起**——这正是 ArkWeb 触发授权弹窗的前提。

## 安卓 / iOS 宿主集成

**安卓（App-plus / app-vue）**：安卓 webview 的 `getUserMedia` **不会自行弹系统授权框**，它依赖宿主 App 已持有 `android.permission.RECORD_AUDIO`。表现：首次按住报 `couldn't start audio` 且不弹框，而别处已授予过麦克风权限后就正常。
- 本组件在**挂载时**会用 `plus.android.requestPermissions(['android.permission.RECORD_AUDIO'])` 自动补申请一次（仅当运行在 App-plus 安卓、`window.plus` 存在时；浏览器/鸿蒙/iOS 是 no-op），令第一次按住即可用。可用 `:auto-request-android-permission="false"` 关闭。
- 若 H5 是被**原生安卓 App 的普通 WebView（无 `plus`）**内嵌，前端无法申请系统权限，须在原生 `WebChromeClient.onPermissionRequest` 中检查并 `Activity.requestPermissions(RECORD_AUDIO)` 后 `request.grant()`，manifest 亦需声明该权限。

**iOS**：
- 系统版本 **iOS 14.3+**（此前无 `navigator.mediaDevices.getUserMedia`）。
- App 内嵌（WKWebView）须宿主 `Info.plist` 声明 `NSMicrophoneUsageDescription`，否则 WKWebView 直接拒绝、不弹框；声明后由 WKWebView 原生弹框，组件不做额外申请（安卓那条 `plus` 逻辑不会在 iOS 触发）。

## 常见问题

- **按下后不弹麦克风权限 / 浮层卡住**：多因宿主 WebView 未转发 `onPermissionRequest`，或页面非 HTTPS，或你（或旧版实现）在 `getUserMedia` 前 `await` 了网络请求消耗了用户手势。本 SDK 已修复第三点。
- **安卓报 `couldn't start audio`（不弹框）**：安卓 webview 不自弹系统授权框，需宿主先持有 `RECORD_AUDIO`。App-plus 下本组件挂载时已用 `plus` 自动申请；原生 WebView（无 plus）需在 `WebChromeClient.onPermissionRequest` 里申请后 `grant`。见「安卓 / iOS 宿主集成」。
- **iOS 无反应 / 报不支持**：确认系统 ≥ iOS 14.3、页面 HTTPS；App 内嵌须在 `Info.plist` 声明 `NSMicrophoneUsageDescription`。
- **弹了权限、也允许了，但没有任何识别文本**：看有没有二进制音频帧发出。若 `ScriptProcessor.onaudioprocess` 在个别 ArkWeb 不回调，可换 `AudioWorklet`（本 SDK 的采音层已隔离，替换成本可控，欢迎提 issue/PR）。
- **识别报「额度已用尽 / 鉴权失败」**：属签名/服务侧问题（腾讯 ASR 错误码 4004/4001~4003），需在注入的 `getSign` 后端处理。
- **小程序端无效**：小程序没有 `getUserMedia`，请勿在该端使用。

## 目录结构

```
uni_modules/uni-web-voice-input/
├─ package.json                     # dcloud 插件元信息
├─ readme.md                        # 本文档
├─ changelog.md
├─ components/
│  └─ uni-web-voice-input/uni-web-voice-input.vue
└─ js_sdk/uni-web-voice/
   ├─ index.js / index.d.ts         # 统一出口 + 类型
   ├─ capability.js                 # 跨端能力探测（含 isHarmonyWebview）
   ├─ pcm.js                        # float→PCM16k、分片拼接
   ├─ realtimeAsr.js                # WebSocket 实时 ASR 客户端（fetchSign 注入）
   └─ voiceRecorder.js              # 采音 + 手势时序 + 状态机编排
```

## 上架到 DCloud 插件市场（步骤）

1. 注册/登录 [DCloud 开发者中心](https://dev.dcloud.net.cn/) 与 [插件市场](https://ext.dcloud.net.cn/)。
2. 把本目录推到 **GitHub** 仓库，根级须能定位到 `uni_modules/uni-web-voice-input`（或按市场要求提交 `uni_modules` 压缩包）。
3. 插件市场「创建新插件」→ 类型选 **前端组件（uni_modules）/ JS SDK** → 填写 GitHub 仓库地址、示例工程、演示 GIF、分类与标签。
4. `package.json` 的 `dcloudext.declaration` 已如实声明：**无广告、不收集数据、使用麦克风权限**；按实际情况确认后再提交。
5. 如需收费/授权，调整 `dcloudext.sale`。
6. 提交审核，通过后即可获得市场链接。

> 提示：示例工程里请放一个能跑通的 demo（含一个可用的 `signUrl`/示例签名），审核会验证「按了能否出字」。

## Demo

见 `examples/`（或插件市场示例工程）：一个页面内含 `<uni-web-voice-input>`，演示注入签名、接收识别文本。

## License

MIT
