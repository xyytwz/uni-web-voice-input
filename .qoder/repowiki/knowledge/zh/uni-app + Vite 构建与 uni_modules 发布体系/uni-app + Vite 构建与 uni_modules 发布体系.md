---
kind: build_system
name: uni-app + Vite 构建与 uni_modules 发布体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - uni_modules/uni-web-voice-input/package.json
    - demo/package.json
    - demo/vite.config.ts
---

## 1. 构建系统概览

仓库采用 **双产物** 模式：
- `uni_modules/uni-web-voice-input/` 作为可发布的 uni-app 插件（同时通过 npm `exports` 暴露 JS SDK 和 Vue 组件）。
- `demo/` 是基于 uni-app + Vite 的 H5 示例应用，用于演示集成用法。

构建工具链为：**Vite 5.2.8** + **@dcloudio/vite-plugin-uni 3.0.0** + **Vue 3.4.21**，Node 版本要求 `>=16`（由根 `package.json` 的 `engines.node` 声明约束）。

仓库中不存在 Makefile、Dockerfile、CI 流水线或自定义构建脚本；所有构建均通过 npm scripts 调用 uni-cli 完成。

## 2. 关键文件

- `package.json`（根）：定义 npm 包元数据、`exports` 映射（`.` → JS SDK，`./component` → Vue 组件）、`files` 白名单（仅打包 js_sdk 与 components 目录）、`uni_modules.id` 与平台声明（H5 / APP / webview），以及 `scripts.lint`（占位，提示接入 eslint）。
- `uni_modules/uni-web-voice-input/package.json`：uni-app 插件描述，`dcloudext` 字段声明 DCloud 插件市场信息（类型 component-vue + sdk、价格 0.00、npmurl），`uni_modules.platforms.client` 精确声明支持的平台矩阵（App app-vue=y/app-nvue=n、H5-mobile Safari/Android Browser/微信/QQ、H5-pc Chrome/IE=n/Edge/Firefox、小程序全 n、快应用全 n、Vue vue2=n/vue3=y）。
- `demo/package.json`：示例应用依赖 `@dcloudio/uni-app`、`@dcloudio/uni-components`、`@dcloudio/uni-h5`（版本号 `3.0.0-4070620250821001`），并提供两个 script：`dev:h5`（`uni`）与 `build:h5`（`uni build`）。
- `demo/vite.config.ts`：极简配置，仅注册 `@dcloudio/vite-plugin-uni` 插件。

## 3. 架构与约定

- **uni_modules 插件结构**：遵循 uni-app 官方约定，SDK 代码位于 `js_sdk/uni-web-voice/`，Vue 组件位于 `components/uni-web-voice-input/`，配套文档在 `readme.md` 与 `changelog.md`。
- **npm 包导出策略**：根 `package.json` 通过 `exports` 同时暴露 JS SDK 入口（`index.js`）与 Vue 组件入口（`uni-web-voice-input.vue`），使消费者既可 `import VoiceInput from 'uni-web-voice-input'` 也可 `import VoiceInputComponent from 'uni-web-voice-input/component'`。
- **发布范围控制**：`files` 数组仅包含 `uni_modules/uni-web-voice-input/js_sdk`、`components`、`readme.md`、`changelog.md`，确保 npm publish 时不附带 demo 源码。
- **平台能力声明**：JS SDK 侧通过 `capability.js` 做运行时能力探测（注释提及“结构化判定鸿蒙，不依赖 UA”），与 uni_modules 静态平台矩阵互补。
- **示例工程独立化**：`demo/` 是独立的 uni-app 项目，拥有自己的 `package.json`、`vite.config.ts`、`manifest.json`、`pages.json`，与 SDK 源码解耦。

## 4. 约定与约束

- Node 版本 ≥ 16（由根 `package.json` `engines.node` 强制校验）。
- uni_modules 插件必须保持 `uni_modules/uni-web-voice-input/` 目录结构与 `package.json` 中的 `id: "uni-web-voice-input"` 一致（由 uni-app 编译器校验）。
- 示例应用开发/构建命令固定为 `pnpm dev:h5` / `pnpm build:h5`（实际执行 `uni` / `uni build`）。
- 无 lint 规则：根 `scripts.lint` 仅为占位输出并 `exit 0`，未接入 eslint/prettier。
- 无 CI/CD、无 Docker、无自动化发布流程；版本号为硬编码的 `1.0.0`（根与 uni_modules 各自维护）。
- 不支持的平台在 uni_modules 平台矩阵中显式标记为 `n`（如小程序、快应用、app-nvue、vue2、IE 等），构成构建期/安装期的兼容性约束。