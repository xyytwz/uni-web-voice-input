/**
 * PCM 处理：Float32（Web Audio 采样）→ PCM16（默认 16kHz 单声道）
 * 与腾讯云实时语音识别 voice_format=1（16k, 16bit, mono）对齐；目标采样率可配。
 */

/**
 * 线性重采样 + Float32 → Int16。
 * @param {Float32Array} input  麦克风原始采样（单声道）
 * @param {number} inputRate    AudioContext 实际采样率（如 44100/48000）
 * @param {number} [targetRate=16000] 目标输出采样率
 * @returns {ArrayBuffer} 重采样后的 PCM16 小端字节
 */
export function floatToPcm16k(input, inputRate, targetRate) {
  const dstRate = targetRate || 16000;
  const ratio = inputRate / dstRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const idx = Math.min(input.length - 1, Math.floor(i * ratio));
    const s = Math.max(-1, Math.min(1, input[idx] || 0));
    pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return pcm.buffer;
}

/** 拼接 Uint8Array 分片为单个 ArrayBuffer（用于「整段兜底识别」） */
export function concatPcmChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
