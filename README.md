# uni-web-voice-input

**鸿蒙 ArkWeb `<web-view>` 也能用的**跨端语音输入 SDK + uni-app 组件 —— 按住说话、松手出字、上滑取消。

基于纯 Web 能力（`getUserMedia` + Web Audio + WebSocket 实时 ASR），专为「H5 页面被各端 WebView 内嵌、原生录音桥不可用」的场景而生：

- 🎯 **鸿蒙 HarmonyOS ArkWeb**：内置「手势窗口内发起 `getUserMedia`」等时序修复，解决按住不弹麦克风权限、有权限却零识别文本两大顽症；结构化能力探测判端，不依赖易被宿主覆写的 UA；
- 🌐 **H5 / App-vue / 安卓·iOS WebView**：一份代码多端运行（仅 Vue3，详见插件文档的平台支持表）；
- 🔌 **后端解耦**：ASR 签名以 `getSign` / `signUrl` / `fetchSign` 注入，不绑定厂商密钥（默认兼容腾讯云 ASR 协议）。

组件 + 脚本 SDK 双用法，无广告、不收集数据，开箱即用。

- 插件目录（DCloud 插件市场 / uni_modules）：[`uni_modules/uni-web-voice-input`](./uni_modules/uni-web-voice-input)
- npm 包名：`uni-web-voice-input`
- 详细用法见插件文档：[`uni_modules/uni-web-voice-input/readme.md`](./uni_modules/uni-web-voice-input/readme.md)

## 亮点（开箱即用的关键修复）

- `getUserMedia` 在**用户手势同步窗口内**发起 —— 修复鸿蒙 ArkWeb「按住不弹麦克风权限」；
- `AudioContext` 手势内创建并 `resume()` —— 修复鸿蒙/iOS「有权限却零 PCM、无识别文本」；
- 结构化跨端探测（`isHarmonyWebview` 用 `__uniapp_x_` / `plus` 判定，不靠 UA）；
- ASR 签名以 `getSign` / `signUrl` / `fetchSign` **注入**，不绑后端与厂商密钥；
- 实时识别 + 整段 PCM 兜底：WS 未连上时松手仍可出字。

## 目录

```
uni-web-voice-input/
├─ package.json                     # npm 包元信息
├─ README.md                        # 本文件
├─ uni_modules/uni-web-voice-input/     # 插件市场用 uni_modules（组件 + SDK）
└─ examples/demo/demo.vue           # 示例页
```

## 发布

### npm
```bash
npm login
npm publish --access public
```

### DCloud 插件市场
1. 将本仓库推送到 GitHub；
2. 在 [ext.dcloud.net.cn](https://ext.dcloud.net.cn/) 「创建新插件」，类型选 **前端组件（uni_modules）/ JS SDK**；
3. 关联 GitHub 仓库、上传示例工程（`examples/`）与演示视频；
4. 确认 `dcloudext.declaration`（无广告 / 不收集数据 / 麦克风权限）后提交审核。

## License

MIT
