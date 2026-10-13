/**
 * 语音录制编排器：getUserMedia + Web Audio 采 PCM + 实时 ASR，一站式「按住说话」生命周期。
 *
 * 这是本 SDK 的灵魂，封装了两端联调踩出来的关键时序：
 *  1) start() 必须在「按下」这次用户手势的【同步窗口】内调用，且函数内部在真正 await 之前
 *     就同步发起 getUserMedia、创建 AudioContext 并发踢 ASR 连接。否则 user-activation 失效，
 *     鸿蒙 ArkWeb 不会触发 onPermissionRequest → 系统麦克风授权框根本不弹（表现为「按了没反应」）。
 *  2) AudioContext 常以 suspended 起，导致 ScriptProcessor.onaudioprocess 不回调 → 有权限却零 PCM；
 *     故创建后显式 resume()。
 *  3) 实时 WS 未连上时先丢弃/缓存，松手若没结果再用整段 PCM 兜底识别一次。
 *
 * 不依赖 Vue / uni / 任何后端：ASR 签名通过 options.fetchSign 注入。
 */

import { createRealtimeAsrClient } from './realtimeAsr.js';
import { floatToPcm16k, concatPcmChunks } from './pcm.js';
import { getMicBlockReason } from './capability.js';

/**
 * 把 getUserMedia 抛出的 DOMException / Error 映射为可读中文文案。
 * 覆盖：权限被拒 / 无设备 / 设备被占用 / 约束不满足，其它回落原始 message。
 * @param {any} e
 * @returns {string}
 */
export function describeMicError(e) {
  const name = (e && (e.name || '')) || '';
  const msg = (e && e.message) || '';
  if (/NotAllowedError|PermissionDenied|SecurityError/i.test(name)) {
    return '麦克风权限被拒绝，请在浏览器/系统设置中允许后重试';
  }
  if (/NotFoundError|DevicesNotFound/i.test(name)) {
    return '未检测到麦克风设备';
  }
  if (/NotReadableError|AbortError|InUse/i.test(name)) {
    return '麦克风被其它应用占用，暂时无法录音';
  }
  if (/OverconstrainedError/i.test(name)) {
    return '当前设备不支持所需录音参数';
  }
  return msg || '麦克风启动失败';
}

/**
 * @typedef {'idle'|'preparing'|'recording'|'recognizing'|'canceled'} RecorderState
 */

/**
 * @param {Object} options
 * @param {() => Promise<any>} options.fetchSign          必填：返回含 wss url 的签名对象
 * @param {Object} [options.handlers]                     { onPartial, onFinal, onError, onStateChange }
 * @param {number} [options.voiceFormat=1]                ASR 编码：1=16k PCM16（腾讯云）
 * @param {number} [options.targetSampleRate=16000]       PCM 目标采样率
 * @param {number} [options.bufferSize=4096]              ScriptProcessor 缓冲帧
 * @param {number} [options.minDurationMs=600]            小于该时长判定为「说得太短」
 * @param {Object} [options.mediaConstraints]             getUserMedia 音频约束
 * @param {boolean} [options.debug=false]
 * @param {typeof WebSocket} [options.WebSocketImpl]      自定义 WebSocket（App 端可注入）
 * @param {Window} [options._win]  @param {Navigator} [options._nav]  注入以便测试/非标准环境
 */
export function createVoiceRecorder(options = {}) {
  const {
    handlers = {},
    voiceFormat = 1,
    targetSampleRate = 16000,
    bufferSize = 4096,
    minDurationMs = 600,
    debug = false,
    mediaConstraints = {
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    },
  } = options;

  const w = options._win || (typeof window !== 'undefined' ? window : undefined);
  const n = options._nav || (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!w) throw new Error('[voice] 当前非浏览器/WebView 环境，无法录音');

  const asr = createRealtimeAsrClient({
    fetchSign: options.fetchSign,
    debug,
    WebSocketImpl: options.WebSocketImpl,
  });

  let state = 'idle';
  let mediaStream = null;
  let audioContext = null;
  let scriptProcessor = null;
  let mediaSourceNode = null;
  let receivedPcmBytes = 0;
  let startedAt = 0;
  let manualCancel = false;
  let lastPartial = '';
  let lastFinal = '';
  const recordedPcmChunks = [];

  const setState = (s) => {
    state = s;
    handlers.onStateChange && handlers.onStateChange(s);
  };

  const asrHandlers = () => ({
    onPartial: (t) => {
      if (!t) return;
      lastPartial = t;
      handlers.onPartial && handlers.onPartial(t);
    },
    onFinal: (t) => {
      if (!t) return;
      lastFinal = t;
      handlers.onFinal && handlers.onFinal(t);
    },
    onError: (m) => {
      handlers.onError && handlers.onError(m);
    },
  });

  const teardownAudio = () => {
    try {
      scriptProcessor && scriptProcessor.disconnect();
    } catch {
      // ignore
    }
    try {
      mediaSourceNode && mediaSourceNode.disconnect();
    } catch {
      // ignore
    }
    scriptProcessor = null;
    mediaSourceNode = null;
    if (audioContext) {
      try {
        audioContext.close();
      } catch {
        // ignore
      }
      audioContext = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  };

  const clearBuffers = () => {
    receivedPcmBytes = 0;
    recordedPcmChunks.length = 0;
    lastPartial = '';
    lastFinal = '';
    startedAt = 0;
    manualCancel = false;
  };

  /**
   * 开始录音。**必须在用户手势（touchstart / mousedown）的同步代码里直接调用**，
   * 不要在它前面插入任何 await。返回的 Promise 在「ASR 连上且进入录音态」后 resolve。
   */
  async function start() {
    if (state === 'preparing' || state === 'recording') return;

    if (!n || !n.mediaDevices || !n.mediaDevices.getUserMedia) {
      throw new Error(getMicBlockReason(w, n) || '当前环境不支持录音');
    }
    const AudioCtx = w.AudioContext || w.webkitAudioContext;
    if (!AudioCtx) throw new Error('当前环境不支持音频处理（缺少 AudioContext）');

    setState('preparing');
    clearBuffers();

    // —— 以下三件事全部发生在同一次按下手势的同步 tick，绝不先 await 网络 ——
    // ① 后台并发踢 ASR 连接（签名 + WebSocket），不 await
    const asrReady = asr.start(asrHandlers(), { voiceFormat });
    asrReady.catch(() => undefined); // 失败统一在下面 await 处抛出处理
    // ② 立即发起 getUserMedia（保住 user-activation，鸿蒙才会弹权限）
    const micPromise = n.mediaDevices.getUserMedia(mediaConstraints);
    // 接住可能的 unhandled rejection（如下一行 AudioCtx 构造抛错导致未走到 await）
    micPromise.catch(() => undefined);
    // ③ 立即创建 AudioContext，尽量以 running 起
    audioContext = new AudioCtx();

    try {
      mediaStream = await micPromise;
    } catch (e) {
      // 采音失败：关掉已并发的 ASR 与音频上下文，映射成人话后抛出，交由调用方 catch
      asr.cancel();
      teardownAudio();
      setState('idle');
      throw new Error(describeMicError(e));
    }
    if (state === 'canceled') {
      asr.cancel();
      teardownAudio();
      setState('idle');
      return;
    }

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        // ignore
      }
    }

    mediaSourceNode = audioContext.createMediaStreamSource(mediaStream);
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    scriptProcessor.onaudioprocess = (ev) => {
      if (manualCancel) return;
      if (state !== 'preparing' && state !== 'recording') return;
      if (!asr.isConnected()) return; // ASR 未连上先丢弃（未连上的头几百毫秒损失极小）
      const input = ev.inputBuffer.getChannelData(0);
      const rate = audioContext ? audioContext.sampleRate : targetSampleRate;
      const pcm = floatToPcm16k(input, rate, targetSampleRate);
      const bytes = new Uint8Array(pcm);
      receivedPcmBytes += bytes.byteLength;
      // 整段备份（拷贝，避免 ScriptProcessor 复用底层 buffer）
      if (recordedPcmChunks.length < 400) {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        recordedPcmChunks.push(copy);
      }
      asr.sendAudio(pcm);
    };

    mediaSourceNode.connect(scriptProcessor);
    scriptProcessor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    // 音频链路就绪后，等 ASR 连接完成再进入录音态；连接失败会抛错，交给调用方 catch
    await asrReady;
    if (manualCancel || state === 'canceled') {
      teardownAudio();
      asr.cancel();
      setState('idle');
      return;
    }
    startedAt = Date.now();
    setState('recording');
  }

  /**
   * 松手结束：flush → 停止实时 ASR 取文字；若实时无结果则用整段 PCM 兜底识别。
   * @returns {Promise<string>} 识别文本；无内容/太短会 reject 带可读文案
   */
  async function stop() {
    if (state === 'idle') return '';
    if (manualCancel || state === 'canceled') {
      asr.cancel();
      teardownAudio();
      clearBuffers();
      setState('idle');
      return '';
    }

    const duration = startedAt ? Date.now() - startedAt : 0;
    const hasText = !!(lastPartial || lastFinal);
    if (duration < minDurationMs && !hasText && receivedPcmBytes < 3200) {
      asr.cancel();
      teardownAudio();
      clearBuffers();
      setState('idle');
      throw new Error('录音时间太短，请按住说话');
    }

    setState('recognizing');
    let text = '';
    if (asr.isConnected()) {
      const stopped = await asr.stop();
      text = (stopped || '').trim() || lastFinal.trim() || lastPartial.trim();
    } else {
      asr.cancel();
      text = lastFinal.trim() || lastPartial.trim();
    }

    if (!text && recordedPcmChunks.length > 0) {
      text = (await asr.recognizePcmBuffer(concatPcmChunks(recordedPcmChunks), asrHandlers())).trim();
    }

    teardownAudio();

    if (!text) {
      const msg =
        receivedPcmBytes === 0
          ? '未采集到音频，请确认麦克风权限后重试'
          : '未识别到内容，请靠近麦克风再说一次';
      clearBuffers();
      setState('idle');
      throw new Error(msg);
    }

    clearBuffers();
    setState('idle');
    return text;
  }

  /** 主动取消（如上滑取消手势） */
  function cancel() {
    manualCancel = true;
    setState('canceled');
    asr.cancel();
    teardownAudio();
  }

  return {
    start,
    stop,
    cancel,
    getState: () => state,
    getPartialText: () => lastPartial || lastFinal,
    /** 预热签名，减少首次按下等待（可选） */
    prefetch: () => asr.prefetchTicket(),
  };
}
