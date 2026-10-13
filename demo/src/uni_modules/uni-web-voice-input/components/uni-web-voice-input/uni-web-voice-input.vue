<template>
  <view class="uni-web-voice">
    <!-- 按住说话条 -->
    <view
      class="uni-web-voice__bar"
      :class="{ 'is-active': isBusy }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
      @contextmenu.prevent="() => {}"
      @mousedown="onMouseDown"
    >
      <text class="uni-web-voice__bar-text">{{ barText }}</text>
    </view>

    <!-- 录音浮层 -->
    <view v-if="showModal" class="uni-web-voice__mask">
      <view class="uni-web-voice__panel">
        <view class="uni-web-voice__duration">{{ durationText }}</view>
        <view class="uni-web-voice__hint" :class="{ 'is-cancel': willCancel }">{{ hintText }}</view>
        <view v-if="partialText" class="uni-web-voice__partial">{{ partialText }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * uni-web-voice-input：纯 Web 能力「按住说话」组件。
 * 内部驱动 js_sdk/uni-web-voice 的 createVoiceRecorder，手势时序修复已封装在 SDK 内，
 * 组件只负责 UI 与把 start()/stop() 挂在正确的 touch 时机上。
 *
 * 关键：onTouchStart 里【同步】调用 recorder.start()（不在其前插入 await），
 * 以确保鸿蒙 ArkWeb 触发麦克风授权弹窗。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import {
  createVoiceRecorder,
  getMicBlockReason,
  probeMicPermission,
  isAppPlusAndroid,
  requestRecordAudioViaPlus,
} from '../../js_sdk/uni-web-voice/index.js';

const props = defineProps({
  /** 签名注入：() => Promise<{ url, expired?, voiceId? }>；优先于 signUrl */
  getSign: { type: Function, default: null },
  /** 或直接给一个 GET 返回签名的地址（返回体可为 {url} 或 {data:{url}}） */
  signUrl: { type: String, default: '' },
  voiceFormat: { type: Number, default: 1 },
  debug: { type: Boolean, default: false },
  /** 上滑超过该像素判定为取消 */
  cancelThreshold: { type: Number, default: 80 },
  /** 安卓 App-plus 内是否在组件挂载时自动申请 RECORD_AUDIO（webview 不自动弹系统框，需宿主补这一步）；非 App-plus 无副作用 */
  autoRequestAndroidPermission: { type: Boolean, default: true },
});

const emit = defineEmits(['result', 'partial', 'error', 'state']);

const state = ref('idle'); // idle | preparing | recording | recognizing | canceled
const partialText = ref('');
const willCancel = ref(false);
const seconds = ref(0);
const deniedHint = ref(false); // navigator.permissions 探到麦克风被拒时的预提示

let recorder = null;
let timer = null;
let firstTouchY = -1;
let activeTouchId = null;
let pressing = false;

const isBusy = computed(() => state.value === 'recording' || state.value === 'preparing');
const showModal = computed(() =>
  ['preparing', 'recording', 'recognizing'].includes(state.value),
);
const barText = computed(() => {
  if (state.value === 'recognizing') return '正在识别…';
  if (state.value === 'recording') return '抬起发送';
  if (deniedHint.value) return '麦克风未授权，点击重试';
  return '按住说话';
});
const hintText = computed(() => {
  if (state.value === 'recognizing') return '正在识别';
  if (willCancel.value) return '松开取消';
  return '松开发送，上滑取消';
});
const durationText = computed(() => {
  const s = Math.max(0, seconds.value);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
});

const resolveSign = () => {
  if (typeof props.getSign === 'function') return props.getSign();
  if (props.signUrl) {
    return fetch(props.signUrl)
      .then((r) => r.json())
      .then((j) => (j && j.data ? j.data : j));
  }
  return Promise.reject(new Error('请通过 getSign 或 signUrl 提供 ASR 签名'));
};

const fail = (message) => {
  emit('error', message);
  stopTimer();
  setState('idle');
};

const setState = (s) => {
  state.value = s;
  emit('state', s);
};

const startTimer = () => {
  stopTimer();
  seconds.value = 0;
  timer = setInterval(() => {
    seconds.value += 1;
  }, 1000);
};
const stopTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

onMounted(() => {
  recorder = createVoiceRecorder({
    fetchSign: resolveSign,
    voiceFormat: props.voiceFormat,
    debug: props.debug,
    handlers: {
      onPartial: (t) => {
        partialText.value = t;
        emit('partial', t);
      },
      onFinal: (t) => {
        partialText.value = t;
      },
      onError: (m) => emit('error', m),
      onStateChange: (s) => {
        setState(s);
        if (s === 'recording') {
          deniedHint.value = false;
          startTimer();
        } else {
          stopTimer();
        }
      },
    },
  });
  // 预热签名，减少首次按下等待
  recorder.prefetch();
  // 异步探测授权状态（不阻塞、不影响手势）：已拒绝则预显示引导文案
  probeMicPermission().then((s) => {
    if (s === 'denied') deniedHint.value = true;
  });
  // 安卓 App-plus：webview 的 getUserMedia 不会自动弹系统授权框，需宿主先持有 RECORD_AUDIO。
  // 组件挂载时主动补一次运行时权限申请，令「第一次按住」即可用；非 App-plus 环境为 no-op。
  if (props.autoRequestAndroidPermission && isAppPlusAndroid()) {
    requestRecordAudioViaPlus().then((s) => {
      if (props.debug) console.log('[uni-web-voice] plus RECORD_AUDIO:', s);
      deniedHint.value = s !== 'granted';
    });
  }
});

onBeforeUnmount(() => {
  stopTimer();
  try {
    recorder && recorder.cancel();
  } catch {
    // ignore
  }
});

// —— 触摸 —— //
const beginPress = (identifier, pageY) => {
  const reason = getMicBlockReason();
  if (reason) {
    fail(reason);
    return false;
  }
  pressing = true;
  willCancel.value = false;
  partialText.value = '';
  activeTouchId = identifier;
  firstTouchY = pageY;
  // 关键：同步调用，保住用户手势（鸿蒙/安卓才会弹麦克风权限）
  recorder.start().catch((err) => {
    if (!pressing) return;
    let message = err instanceof Error ? err.message : '录音启动失败';
    // 安卓 App-plus 起播失败多为系统录音权限未授予（webview 不自动弹框）：换成人话并补弹一次权限
    if (isAppPlusAndroid() && /audio|permission|notreadable|notallowed|denied|start/i.test(message)) {
      message = '请先允许麦克风权限，然后再次按住说话';
      deniedHint.value = true;
      requestRecordAudioViaPlus().then((s) => {
        if (s === 'granted') deniedHint.value = false;
      });
    }
    fail(message);
    pressing = false;
  });
  return true;
};

const endPress = () => {
  if (!pressing) return;
  pressing = false;
  const canceled = willCancel.value;
  activeTouchId = null;
  firstTouchY = -1;
  willCancel.value = false;
  if (canceled) {
    recorder.cancel();
    return;
  }
  recorder
    .stop()
    .then((text) => {
      if (text) emit('result', text);
      partialText.value = '';
    })
    .catch((err) => fail(err instanceof Error ? err.message : '语音识别失败'));
};

const onTouchStart = (e) => {
  const t = e.touches && e.touches[0];
  if (!t) return;
  beginPress(t.identifier, t.pageY);
};

const onTouchMove = (e) => {
  if (!pressing) return;
  const list = e.touches || [];
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    if (activeTouchId != null && t.identifier !== activeTouchId) continue;
    willCancel.value = firstTouchY - t.pageY > props.cancelThreshold;
    break;
  }
};

const onTouchEnd = () => endPress();
const onTouchCancel = () => {
  if (pressing) {
    pressing = false;
    recorder.cancel();
  }
};

// —— H5 桌面鼠标兜底 —— //
const onMouseDown = () => {
  if (typeof window === 'undefined') return;
  if (!beginPress(null, 0)) return;
  const up = () => {
    endPress();
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mouseup', up);
};

defineExpose({ recorder, state });
</script>

<style lang="scss" scoped>
.uni-web-voice {
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.uni-web-voice__bar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 44rpx;
  background: #f2f3f5;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.uni-web-voice__bar.is-active {
  background: #e5f6ef;
}
.uni-web-voice__bar-text {
  font-size: 30rpx;
  color: #1d1e1f;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.uni-web-voice__mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 9999;
}
.uni-web-voice__panel {
  width: 480rpx;
  padding: 40rpx 32rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.96);
  text-align: center;
}
.uni-web-voice__duration {
  font-size: 44rpx;
  font-weight: 600;
  color: #1d1e1f;
}
.uni-web-voice__hint {
  margin-top: 16rpx;
  font-size: 28rpx;
  color: #666;
}
.uni-web-voice__hint.is-cancel {
  color: #f53f3f;
}
.uni-web-voice__partial {
  margin-top: 20rpx;
  font-size: 28rpx;
  color: #087a57;
  max-height: 160rpx;
  overflow: hidden;
}
</style>
