# uni-web-voice-input 示例工程（Demo）

一个可直接运行的 uni-app（Vue3）示例工程，演示 `uni-web-voice-input` 语音输入组件的用法。

## 运行方式

### 用 HBuilderX（推荐，插件市场审核同款）
1. HBuilderX → 文件 → 打开目录 → 选择本 `demo/` 目录；
2. 运行 → 运行到浏览器（H5），或运行到手机/模拟器（App）；
3. 首页即为示例页，按住底部按钮说话。

> 本目录遵循 HBuilderX 工程结构（根级 `pages/`、`App.vue`、`main.js`、`manifest.json`、`pages.json`、`uni_modules/`），无需 `npm install`。

## 让它真正出字
示例页 `pages/index/index.vue` 顶部：

```js
const SIGN_URL = 'https://your.domain/api/app/ai/asr/sign';
```

把它换成你自己的 ASR 签名接口。要求：`GET` 后返回体（`{url}` 或 `{data:{url}}` 均可）里含一个已签名的实时语音识别 **wss URL**（默认兼容腾讯云 ASR）。若你有自定义取签名逻辑，改 `getSign` 函数即可，无需 `signUrl`。

## 环境前提
- **H5 / WebView**：必须 HTTPS 或 localhost，否则 `getUserMedia` 被安全上下文拦截。
- **鸿蒙 ArkWeb `<web-view>` 内嵌**：宿主需 ① 声明麦克风权限 ② WebView 实现 `onPermissionRequest` 转发 ③ 页面 HTTPS。详见插件 `readme.md` 的「鸿蒙宿主集成」。

## 目录
```
demo/
├─ pages/index/index.vue     # 示例页（组件用法 + getSign 注入）
├─ uni_modules/uni-web-voice-input/  # 插件本体（示例工程自包含）
├─ App.vue / main.js
├─ pages.json / manifest.json / uni.scss
```
