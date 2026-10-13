# uni-web-voice-input

纯 Web 能力（`getUserMedia` + Web Audio + WebSocket 实时 ASR）的**跨端语音输入 SDK + uni-app 组件**。
面向 H5、App-vue，以及被各端 WebView（**尤其鸿蒙 ArkWeb `<web-view>`**）内嵌、原生录音桥不可用的场景。

- 插件目录（DCloud 插件市场 / uni_modules）：[`uni_modules/uni-web-voice-input`](./uni_modules/uni-web-voice-input)
- npm 包名：`uni-web-voice-input`
- 详细用法见插件文档：[`uni_modules/uni-web-voice-input/readme.md`](./uni_modules/uni-web-voice-input/readme.md)

## 亮点（开箱即用的关键修复）

- `getUserMedia` 在**用户手势同步窗口内**发起 —— 修复鸿蒙 ArkWeb「按住不弹麦克风权限」；
- `AudioContext` 手势内创建并 `resume()` —— 修复「有权限却零 PCM、无识别文本」；
- 结构化跨端探测（`isHarmonyWebview` 用 `__uniapp_x_` / `plus` 判定，不靠 UA）；
- ASR 签名以 `getSign` / `signUrl` / `fetchSign` **注入**，不绑后端与厂商密钥。

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
