## 1.0.0（初版）

- 新增：纯 Web 能力语音输入 SDK（`getUserMedia` + Web Audio + WebSocket 实时 ASR）。
- 新增：`createVoiceRecorder` 一站式「按住说话」编排，内置关键时序修复：
  - `getUserMedia` 在用户手势同步窗口内发起（修复鸿蒙 ArkWeb 不弹麦克风权限）；
  - `AudioContext` 手势内创建并 `resume()`（修复有权限却零 PCM）；
  - ASR 连接与取麦克风并发；实时无结果时用整段 PCM 兜底识别。
- 新增：`createRealtimeAsrClient`，签名接口以 `fetchSign` 注入，兼容腾讯云 ASR 协议与错误码。
- 新增：跨端能力探测 `isHarmonyWebview` / `canUseWebMic` / `getMicBlockReason`（结构化判定，不依赖 UA）。
- 新增：uni-app 组件 `uni-web-voice-input`（免注册，`getSign`/`signUrl` 注入，`result/partial/error/state` 事件）。
