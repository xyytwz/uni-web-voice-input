---
kind: logging_system
name: 基于 console.log 的简易调试日志
category: logging_system
scope:
    - '**'
source_files:
    - uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/realtimeAsr.js
---

## 概述

本仓库未引入任何第三方日志框架（如 log4js、winston、pino 等），也没有统一的 logger 初始化或配置模块。日志输出完全依赖浏览器/运行时的原生 `console` API，并通过一个局部的 `debug` 布尔开关控制是否输出。

## 关键文件与位置

- `uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/realtimeAsr.js`：SDK 核心实时语音识别逻辑中唯一使用日志的地方。
- `demo/src/uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/realtimeAsr.js`：demo 应用中复用的同一份 SDK 代码（两份路径内容一致）。

## 架构与约定

1. **无全局 Logger**：仓库中没有 `log/`、`logging/` 目录，也没有 `logger.js`、`log.js` 之类的中心化工具。
2. **条件式 console 调用**：在 `realtimeAsr.js` 中定义了一个局部变量 `debug`，所有日志输出都包裹在 `if (debug)` 判断内：
   - `console.log(...a)` — 普通信息
   - `console.warn(...a)` — 警告
   - `console.error(...a)` — 错误
3. **参数透传**：日志函数直接展开传入的参数数组 `...a`，没有对消息做统一格式化、时间戳注入或结构化字段封装。
4. **无日志级别管理**：不存在按级别过滤、按环境切换、按目标分流（文件/网络/控制台）的配置机制。
5. **无持久化 sink**：日志仅输出到控制台，没有写入文件或上报远端。

## 约定与约束

- **观察到的模式**：仅在 `realtimeAsr.js` 中使用 `console.log/warn/error`，且全部受 `debug` 变量控制；其他 JS 文件未发现日志输出。
- **非强制规则**：仓库中没有 lint 规则、文档或类型声明强制要求使用某种日志方式——这只是一个实现选择，而非被框架或构建流程 enforced 的约束。
- **可移植性**：由于直接使用 `console`，该 SDK 可在任意支持 `console` 的 H5/webview 环境中运行，无需额外依赖。

## 结论

这是一个极简的、面向调试的原生 console 日志用法，不构成一个成体系的 logging system。若需要扩展为结构化日志、分级输出或多 sink 路由，当前仓库没有现成的基础设施可供复用。