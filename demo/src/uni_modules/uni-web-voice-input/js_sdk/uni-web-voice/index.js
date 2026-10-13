/**
 * uni-web-voice-input —— 纯 Web 能力语音输入 SDK
 * 统一出口。framework-agnostic，可在 H5 / App-vue / 各端 WebView（含鸿蒙 ArkWeb）内使用。
 */

export {
  isHarmonyWebview,
  isSecureContext,
  canUseWebMic,
  getMicBlockReason,
  probeMicPermission,
  isAppPlusAndroid,
  requestRecordAudioViaPlus,
} from './capability.js';
export { floatToPcm16k, concatPcmChunks } from './pcm.js';
export { createRealtimeAsrClient } from './realtimeAsr.js';
export { createVoiceRecorder, describeMicError } from './voiceRecorder.js';
