---
kind: configuration_system
name: uni-app + Vite 配置体系（manifest.json / pages.json / vite.config.ts）
category: configuration_system
scope:
    - '**'
source_files:
    - demo/src/manifest.json
    - demo/src/pages.json
    - demo/vite.config.ts
    - package.json
---

## 1. 使用的系统与工具

仓库是一个 uni_modules 插件工程，包含一个基于 uni-app + Vite 的 H5 示例应用。运行时配置由以下三方驱动：

- **uni-app 运行时配置**：`demo/src/manifest.json`、`demo/src/pages.json`
- **构建期配置**：`demo/vite.config.ts`（通过 `@dcloudio/vite-plugin-uni` 接入 uni-app 构建管线）
- **包元数据与发布配置**：根 `package.json` 中的 `uni-app.uni_modules` 字段声明插件 ID 与平台支持

仓库中未发现 `.env*`、`.yaml`、`.toml`、`application.properties` 等外部配置文件，也没有自定义的配置加载逻辑；所有行为均由上述 JSON/TS 文件声明式描述。

## 2. 关键文件

- `demo/src/manifest.json` — uni-app 项目清单，按 target 平台（`app-plus`、`mp-weixin`、`h5`、`quickapp`）分层配置
- `demo/src/pages.json` — 页面路由与全局样式
- `demo/vite.config.ts` — Vite 入口，仅注册 `@dcloudio/vite-plugin-uni` 插件
- `package.json` — 顶层包的 `uni-app.uni_modules` 段声明插件 id、platforms（H5/APP/webview），以及 `files` 白名单
- `demo/package.json` — demo 应用的依赖与脚本（未展开读取）

## 3. 架构与约定

### 3.1 多端分层配置（manifest.json）

`demo/src/manifest.json` 采用 uni-app 约定的“按平台键分块”结构：

- `app-plus`：App 端权限与分发配置，例如 Android 显式声明 `RECORD_AUDIO` 权限
- `mp-weixin`：微信小程序 appid、setting、usingComponents
- `h5`：router.mode = `hash`，devServer.port = `5199`
- `quickapp`：空对象占位

各平台配置彼此独立，不存在跨平台共享的“基础配置”被合并——每个平台块是独立的 JSON 片段。

### 3.2 页面与全局样式（pages.json）

`demo/src/pages.json` 只声明了一个页面 `pages/index/index`，并通过 `globalStyle` 统一导航栏颜色、背景色等。这是 uni-app 的标准约定，无需代码层解析。

### 3.3 构建配置（vite.config.ts）

`demo/vite.config.ts` 极其精简：仅 import `defineConfig` 和 `@dcloudio/vite-plugin-uni`，然后 `plugins: [uni()]`。没有自定义 plugin、alias、optimizeDeps 等扩展，意味着构建行为完全委托给 uni-app 插件。

### 3.4 uni_modules 插件发布配置（package.json）

根 `package.json` 中：

- `main` / `module` / `types` / `exports` 指向 `uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/index.js` 及其 `.vue` 组件
- `uni-app.uni_modules.id` = `"uni-web-voice-input"`，`platforms.client` 列出 `H5`、`APP`、`webview` 三个目标
- `files` 白名单仅打包 `js_sdk`、`components`、`readme.md`、`changelog.md`

这构成了 SDK 的“配置即发布契约”：只有 `files` 列出的路径会被 npm 发布。

## 4. 约定与约束

- **平台配置必须放在 `manifest.json` 对应键下**：`app-plus`、`mp-weixin`、`h5`、`quickapp` 等键名由 uni-app 框架识别，不在这些键下的字段不会被框架消费（见 `manifest.json` 实际结构）。
- **SDK 暴露点受 `exports` 与 `uni-app.uni_modules` 双重约束**：消费者只能通过 `"."`（JS SDK）、`"./component"`（Vue 组件）、`"./package.json"` 三个入口引入，其余路径不可从 npm 导入。
- **发布产物受 `files` 白名单限制**：只有 `js_sdk`、`components`、`readme.md`、`changelog.md` 四个路径会被打包进发布的 npm 包。
- **Node 版本要求**：`engines.node >= 16`（`package.json`）。
- **Demo 开发端口固定为 5199**：来自 `manifest.json` 中 `h5.devServer.port`。
- **H5 路由模式固定为 hash**：来自 `manifest.json` 中 `h5.router.mode = "hash"`。
- **Android 录音权限需显式声明**：`app-plus.distribute.android.permissions` 中包含 `RECORD_AUDIO`，否则 App 端无法调用麦克风。

本仓库没有运行时环境变量注入、feature flag 系统或 secrets 管理逻辑；所有可配置项均为构建/发布期的静态 JSON 声明。