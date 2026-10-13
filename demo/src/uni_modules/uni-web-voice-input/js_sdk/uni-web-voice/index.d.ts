/** uni-web-voice-input 类型声明 */

export type RecorderState =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'recognizing'
  | 'canceled';

export interface AsrSignResult {
  /** 已签名的 wss 连接地址 */
  url: string;
  /** 过期时间戳（秒）；缺省按 10 分钟处理 */
  expired?: number;
  /** 会话/请求标识，可选 */
  voiceId?: string;
}

export type FetchSign = () => Promise<AsrSignResult | Record<string, any>>;

export interface RealtimeAsrHandlers {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

export interface RealtimeAsrClientOptions {
  fetchSign: FetchSign;
  debug?: boolean;
  WebSocketImpl?: typeof WebSocket;
}

export interface RealtimeAsrClient {
  prefetchTicket: () => Promise<void>;
  start: (
    handlers?: RealtimeAsrHandlers,
    options?: { voiceFormat?: number },
  ) => Promise<void>;
  sendAudio: (buffer: ArrayBuffer | string | Uint8Array) => void;
  recognizePcmBuffer: (
    pcm: ArrayBuffer,
    handlers?: RealtimeAsrHandlers,
  ) => Promise<string>;
  stop: () => Promise<string>;
  cancel: () => void;
  isConnected: () => boolean;
}

export interface VoiceRecorderHandlers extends RealtimeAsrHandlers {
  onStateChange?: (state: RecorderState) => void;
}

export interface VoiceRecorderOptions {
  fetchSign: FetchSign;
  handlers?: VoiceRecorderHandlers;
  /** ASR 编码，默认 1（16k PCM16，腾讯云） */
  voiceFormat?: number;
  /** PCM 目标采样率，默认 16000 */
  targetSampleRate?: number;
  /** ScriptProcessor 帧大小，默认 4096 */
  bufferSize?: number;
  /** 小于该时长判定「说得太短」，默认 600ms */
  minDurationMs?: number;
  mediaConstraints?: MediaStreamConstraints;
  debug?: boolean;
  WebSocketImpl?: typeof WebSocket;
  _win?: Window;
  _nav?: Navigator;
}

export interface VoiceRecorder {
  /** 必须在用户手势同步窗口内调用 */
  start: () => Promise<void>;
  stop: () => Promise<string>;
  cancel: () => void;
  getState: () => RecorderState;
  getPartialText: () => string;
  prefetch: () => Promise<void>;
}

export function createRealtimeAsrClient(options: RealtimeAsrClientOptions): RealtimeAsrClient;
export function createVoiceRecorder(options: VoiceRecorderOptions): VoiceRecorder;

export function isHarmonyWebview(win?: Window): boolean;
export function isSecureContext(win?: Window): boolean;
export function canUseWebMic(win?: Window, nav?: Navigator): boolean;
export function getMicBlockReason(win?: Window, nav?: Navigator): string | null;
/** 异步探测麦克风授权状态；不支持 permissions 的环境静默回落 'unknown' */
export function probeMicPermission(
  win?: Window,
  nav?: Navigator,
): Promise<'granted' | 'denied' | 'prompt' | 'unknown'>;
/** 把 getUserMedia 抛出的错误映射为可读中文文案 */
export function describeMicError(e: any): string;
/** 是否运行在 uni-app App-plus 的安卓 webview 内 */
export function isAppPlusAndroid(win?: Window): boolean;
/** 通过 plus.android 申请安卓 RECORD_AUDIO 运行时权限；非 App-plus 回落 'unsupported' */
export function requestRecordAudioViaPlus(
  win?: Window,
): Promise<'granted' | 'denied' | 'unsupported' | 'error'>;

export function floatToPcm16k(
  input: Float32Array,
  inputRate: number,
  targetRate?: number,
): ArrayBuffer;
export function concatPcmChunks(chunks: Uint8Array[]): ArrayBuffer;
