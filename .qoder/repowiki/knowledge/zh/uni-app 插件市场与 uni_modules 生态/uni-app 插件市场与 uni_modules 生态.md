---
kind: external_dependency
name: uni-app 插件市场与 uni_modules 生态
slug: uni-app-dcloud
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

本仓库以 uni_modules 形式发布为 DCloud 插件（id=uni-web-voice-input），同时作为 npm 包 `uni-web-voice-input` 分发。插件元信息通过 `dcloudext.type=["component-vue","sdk"]` 声明为「组件+SDK」双形态，平台支持表在 `uni_modules.platforms.client` 中按 App/H5/小程序/快应用/浏览器细分；Demo 工程使用 HBuilderX + Vite 双结构，`demo/src/manifest.json` 是标准 uni-app manifest。上架流程见根 README：推 GitHub → ext.dcloud.net.cn 创建前端组件/JS SDK 插件并关联仓库。