/**
 * 实时语音识别客户端（Web 原生 WebSocket，兼容腾讯云 ASR 协议）
 *
 * 流程：调用方注入的 fetchSign() 取「已签名 wss URL」→ 直连 → 推 PCM16 → 松手发 {type:'end'}
 *
 * 与后端解耦：本文件不 import 任何具体业务 API，签名怎么取（HTTP/鉴权/字段）由使用方通过
 * options.fetchSign 注入。默认按「响应体含 url / expired / voiceId」解析，兼容多种字段命名。
 */

const STOP_WAIT_MS = 6000;
const CONNECT_TIMEOUT_MS = 8000;
const RECOGNIZE_TIMEOUT_MS = 20000;
/** 签名约 10 分钟有效，提前 60s 刷新 */
const SIGN_SKEW_SEC = 60;
const DEFAULT_SIGN_TTL_SEC = 600;
const CHUNK_BYTES = 3200;
const CHUNK_INTERVAL_MS = 40;

function parseSocketData(data) {
  try {
    if (typeof data === 'string') return JSON.parse(data);
    const text = new TextDecoder('utf-8').decode(new Uint8Array(data));
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickWsUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const raw =
    payload.url || payload.wsUrl || payload.wssUrl || payload.ws_url || payload.wss_url;
  return typeof raw === 'string' ? raw.trim() : '';
}

function pickExpired(payload, fallbackNow) {
  if (!payload || typeof payload !== 'object') return fallbackNow + DEFAULT_SIGN_TTL_SEC;
  const n = typeof payload.expired === 'number' ? payload.expired : Number(payload.expired);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallbackNow + DEFAULT_SIGN_TTL_SEC;
}

function formatAsrServerError(code, message) {
  if (code === 4004) return '语音识别额度已用尽，请联系管理员开通后付费或购买资源包';
  if (code === 4001 || code === 4002 || code === 4003) return '语音识别鉴权失败，请重试';
  const raw = (message || '').trim();
  if (raw) return `语音识别失败：${raw}`;
  return `语音识别失败（错误码 ${code}）`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(p, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * @typedef {Object} RealtimeAsrHandlers
 * @property {(text:string)=>void} [onPartial]
 * @property {(text:string)=>void} [onFinal]
 * @property {(message:string)=>void} [onError]
 */

/**
 * @param {Object} options
 * @param {() => Promise<any>} options.fetchSign  必填：返回含 wss url 的签名对象
 * @param {boolean} [options.debug=false]         是否打印调试日志
 * @param {typeof WebSocket} [options.WebSocketImpl] 自定义 WebSocket 实现（App 端可注入 uni 的）
 */
export function createRealtimeAsrClient(options = {}) {
  const fetchSign = options.fetchSign;
  if (typeof fetchSign !== 'function') {
    throw new Error('[asr] 必须提供 options.fetchSign（返回签名 wss URL 的异步函数）');
  }
  const debug = !!options.debug;
  const WS =
    options.WebSocketImpl ||
    (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
  if (!WS) throw new Error('[asr] 当前环境没有可用的 WebSocket 实现');

  const log = (...a) => {
    if (debug) console.log(...a);
  };
  const warn = (...a) => {
    if (debug) console.warn(...a);
  };
  const errLog = (...a) => {
    if (debug) console.error(...a);
  };

  let socket = null;
  let handlers = {};
  let finalText = '';
  let partialText = '';
  let cachedWsUrl = '';
  let cachedExpire = 0;
  let stopWaitTimer = null;
  let stopResolve = null;
  let recognizeReject = null;
  let pendingError = null;

  const clearStopWait = () => {
    if (stopWaitTimer) {
      clearTimeout(stopWaitTimer);
      stopWaitTimer = null;
    }
  };

  const closeSocket = () => {
    clearStopWait();
    try {
      socket && socket.close();
    } catch {
      // ignore
    }
    socket = null;
  };

  const bestText = () => (finalText || partialText || '').trim();

  const failPending = (err) => {
    pendingError = err;
    handlers.onError && handlers.onError(err.message);
    if (recognizeReject) {
      const reject = recognizeReject;
      recognizeReject = null;
      reject(err);
    }
    if (stopResolve) {
      const resolve = stopResolve;
      stopResolve = null;
      resolve('');
    }
    closeSocket();
  };

  const resolveAsrSign = async () => {
    const now = Math.floor(Date.now() / 1000);
    try {
      const sign = await fetchSign();
      log('[ASR] sign result=', sign);
      const url = pickWsUrl(sign);
      if (!url) throw new Error('获取语音识别签名失败：响应缺少 url');
      return {
        url,
        expired: pickExpired(sign, now),
        voiceId: sign && typeof sign.voiceId === 'string' ? sign.voiceId : undefined,
      };
    } catch (e) {
      errLog('[ASR] sign fail', e);
      const msg = e instanceof Error ? e.message : '';
      throw new Error(msg ? `语音识别签名失败：${msg}` : '语音识别签名失败');
    }
  };

  const refreshSignIfNeeded = async () => {
    const now = Math.floor(Date.now() / 1000);
    if (cachedWsUrl && cachedExpire - SIGN_SKEW_SEC > now) return;
    const signed = await resolveAsrSign();
    cachedWsUrl = signed.url;
    cachedExpire = signed.expired;
  };

  const handleMessage = (raw) => {
    const msg = parseSocketData(raw);
    if (msg) log('[ASR] wss message=', JSON.stringify(msg));
    if (!msg) return;
    if (typeof msg.code === 'number' && msg.code !== 0) {
      const errMsg = formatAsrServerError(msg.code, msg.message);
      errLog('[ASR] server error', msg.code, errMsg);
      if ([4001, 4002, 4003, 4004].includes(msg.code)) {
        cachedWsUrl = '';
        cachedExpire = 0;
      }
      failPending(new Error(errMsg));
      return;
    }
    const text = (msg.result && msg.result.voice_text_str) || '';
    if (text) {
      if (msg.result && msg.result.slice_type === 2) {
        finalText = text;
        handlers.onFinal && handlers.onFinal(text);
      } else {
        partialText = text;
        handlers.onPartial && handlers.onPartial(text);
      }
    }
    if (msg.final === 1) {
      if (!finalText && partialText) finalText = partialText;
      const done = bestText();
      if (stopResolve) {
        stopResolve(done);
        stopResolve = null;
      }
      clearStopWait();
      closeSocket();
    }
  };

  const connect = async (voiceFormat = 1) => {
    closeSocket();
    finalText = '';
    partialText = '';
    await refreshSignIfNeeded();
    let url = cachedWsUrl;
    if (!url) throw new Error('获取语音识别签名失败');
    if (!/[?&]voice_format=/.test(url)) {
      url += `${url.includes('?') ? '&' : '?'}voice_format=${voiceFormat}`;
    }
    log('[ASR] connecting...');
    await new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try {
        ws = new WS(url);
      } catch (e) {
        reject(e instanceof Error ? e : new Error('无法创建语音识别连接'));
        return;
      }
      socket = ws;
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error('语音识别连接超时'));
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        log('[ASR] connected');
        resolve();
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('语音识别连接失败，请检查网络后重试'));
      };
      ws.onmessage = (ev) => handleMessage(ev.data);
      ws.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('语音识别连接已关闭'));
        }
        if (stopResolve) {
          stopResolve(bestText());
          stopResolve = null;
        }
      };
    });
  };

  const sendAudio = (buffer) => {
    if (!socket || socket.readyState !== WS.OPEN) return;
    if (typeof buffer === 'string') {
      socket.send(buffer);
      return;
    }
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    socket.send(copy.buffer);
  };

  const pushPcmChunks = async (pcm) => {
    const bytes = new Uint8Array(pcm);
    let sent = 0;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      if (!socket || socket.readyState !== WS.OPEN) break;
      sendAudio(bytes.slice(offset, offset + CHUNK_BYTES));
      sent += 1;
      await sleep(CHUNK_INTERVAL_MS);
    }
    log('[ASR] pcm chunks sent=', sent, 'bytes=', bytes.length);
  };

  const stop = () =>
    new Promise((resolve) => {
      if (!socket || socket.readyState !== WS.OPEN) {
        resolve(bestText());
        return;
      }
      stopResolve = resolve;
      try {
        socket.send(JSON.stringify({ type: 'end' }));
      } catch {
        // ignore
      }
      clearStopWait();
      stopWaitTimer = setTimeout(() => {
        resolve(bestText());
        closeSocket();
      }, STOP_WAIT_MS);
    });

  return {
    async prefetchTicket() {
      try {
        const signed = await resolveAsrSign();
        cachedWsUrl = signed.url;
        cachedExpire = signed.expired;
      } catch (e) {
        warn('[ASR] prefetch fail', e);
      }
    },
    async start(nextHandlers = {}, opts) {
      handlers = nextHandlers;
      await connect((opts && opts.voiceFormat) ?? 1);
    },
    sendAudio,
    async recognizePcmBuffer(pcm, nextHandlers = {}) {
      handlers = nextHandlers;
      pendingError = null;
      return withTimeout(
        (async () => {
          await new Promise((resolve, reject) => {
            recognizeReject = reject;
            connect(1)
              .then(() => {
                recognizeReject = null;
                if (pendingError) {
                  reject(pendingError);
                  return;
                }
                resolve();
              })
              .catch((e) => {
                recognizeReject = null;
                reject(e);
              });
          });
          if (pendingError) throw pendingError;
          await pushPcmChunks(pcm);
          if (pendingError) throw pendingError;
          const text = await stop();
          if (pendingError) throw pendingError;
          log('[ASR] stop result=', text);
          return text;
        })(),
        RECOGNIZE_TIMEOUT_MS,
        '语音识别超时，请重试',
      );
    },
    stop,
    cancel() {
      recognizeReject = null;
      pendingError = null;
      if (stopResolve) {
        stopResolve(bestText());
        stopResolve = null;
      }
      closeSocket();
    },
    isConnected() {
      return !!socket && socket.readyState === WS.OPEN;
    },
  };
}
