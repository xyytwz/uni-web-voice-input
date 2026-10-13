---
kind: dependency_management
name: 基于 npm + uni_modules 的双轨依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - demo/package.json
    - demo/package-lock.json
    - uni_modules/uni-web-voice-input/package.json
---

## 1. 使用的系统/方法

仓库采用 **npm** 作为包管理器，配合 **Vite**（demo 工程）和 **uni-app / DCloud CLI** 构建。依赖声明分布在三个 `package.json`：
- 根 `package.json`：发布为 npm 包的元数据与入口。
- `demo/package.json`：H5 示例应用依赖。
- `uni_modules/uni-web-voice-input/package.json`：DCloud `uni_modules` 插件清单。

无 lockfile 位于根目录；仅 `demo/package-lock.json` 存在，用于锁定 demo 工程的第三方依赖版本。

## 2. 关键文件

- `package.json` — npm 包入口、`exports` 映射、`files` 白名单、`uni-app.uni_modules` 平台声明。
- `demo/package.json` — uni-app H5 示例应用的运行时与开发依赖。
- `uni_modules/uni-web-voice-input/package.json` — DCloud 扩展点 `dcloudext` 与 `uni_modules.platforms` 能力矩阵。
- `demo/package-lock.json` — demo 的 npm 依赖锁。

## 3. 架构与约定

### 双轨发布策略
该仓库同时以两种身份被消费：

1) **npm 包**（根 `package.json`）：
   - `main` / `module` 指向 `uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/index.js`。
   - `types` 指向同路径下的 `.d.ts`。
   - `exports` 暴露两个子路径：`.`（JS SDK）与 `./component`（Vue 组件），以及 `./package.json`。
   - `files` 白名单只包含 `uni_modules/uni-web-voice-input/js_sdk`、`components`、`readme.md`、`changelog.md`，即发布产物不包含源码树中其他内容。

2) **uni_modules 插件**（`uni_modules/uni-web-voice-input/package.json`）：
   - `dcloudext.type` 声明为 `component-vue` + `sdk`。
   - `dcloudext.npmurl` 指向 npmjs 上的同名包，说明 DCloud 插件市场与 npm 包是同一份代码。
   - `uni_modules.dependencies` 为空数组，表示该插件不依赖其他 uni_modules。
   - `uni_modules.platforms.client` 详细列出支持的平台（App-vue、H5-mobile、H5-pc、Vue3 等），其中小程序、app-nvue、IE、Vue2 等标记为 `n`。

### 示例工程依赖
`demo/package.json` 使用固定版本的 DCloud 生态依赖：
- `@dcloudio/uni-app`、`@dcloudio/uni-components`、`@dcloudio/uni-h5` 均为 `3.0.0-4070620250821001`。
- Vue 3.4.21、vue-router 4.3.0。
- 构建工具链：`vite 5.2.8`、`sass ^1.77.0`、`@dcloudio/vite-plugin-uni`。

### 运行环境约束
根 `package.json` 通过 `engines.node >= 16` 强制 Node ≥ 16。

## 4. 约定与约束

- **零运行时第三方依赖**：根包未声明任何 `dependencies`，SDK 本身仅依赖浏览器原生 API（`getUserMedia`、`WebSocket`、`AudioContext`），因此发布产物无需捆绑第三方库。
- **uni_modules 无外部依赖**：`uni_modules/uni-web-voice-input/package.json` 中 `uni_modules.dependencies: []`，表明该插件自包含，不引入其他 uni_modules。
- **平台能力矩阵受 `uni_modules.platforms` 约束**：DCloud 在打包时会依据此字段校验目标平台是否可用（如小程序统一标记 `n`，IE 标记 `n`，Vue2 标记 `n`）。
- **发布范围由 `files` 白名单控制**：只有 `js_sdk`、`components`、文档文件会被打入 npm tarball。
- **Node 版本下限**：`engines.node >= 16` 是硬性要求（由 npm/yarn/pnpm 在安装时检查）。
- **无私有仓库或镜像配置**：未发现 `.npmrc`、`pnpm-workspace.yaml`、`yarn.lock` 或 GOPRIVATE 等私有源配置；所有依赖来自公共 npm registry。
- **无 vendoring**：除 `demo/node_modules` 外，没有 vendor 目录；第三方依赖通过 npm 安装。
- **仅 demo 有 lockfile**：根目录无 `package-lock.json`，意味着根包的安装版本可能随时间漂移；只有 `demo/package-lock.json` 提供确定性安装。
- **lint 脚本为空占位**：根 `scripts.lint` 仅打印提示并退出 0，未实际接入 eslint，属于待实现项而非约束。

总结：这是一个“一份代码，双重身份”的项目——对 DCloud 生态以 `uni_modules` 形式分发，对通用 JS 生态以 npm 包形式分发；两者共享同一份源码，但依赖管理职责分离：SDK 自身零依赖，示例工程通过 npm 锁定 uni-app/Vue/Vite 的版本。