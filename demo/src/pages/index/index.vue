<template>
  <view class="page">
    <view class="title">uni-web-voice-input 示例</view>
    <view class="tip">按住下方按钮说话 · 松开发送 · 上滑取消</view>

    <view class="card">
      <view class="label">识别结果</view>
      <text class="result" :class="{ placeholder: !result }">{{ result || '— 说话后显示文本 —' }}</text>
    </view>

    <view class="meta">
      <text class="meta-item">状态：{{ stateLabel }}</text>
      <text v-if="partial" class="meta-item partial">实时：{{ partial }}</text>
    </view>

    <!-- ① 组件用法：uni_modules 免注册，直接用标签；签名通过 getSign 注入 -->
    <uni-web-voice-input
      :get-sign="getSign"
      :debug="true"
      @result="onResult"
      @partial="onPartial"
      @error="onError"
      @state="onState"
    />

    <view class="hint">
      注意事项：<br />
      1. 把 SIGN_URL 换成你自己的 ASR 签名接口（返回体需含 wss url），即可真机出字。<br />
      2. 鸿蒙内嵌需宿主 WebView 声明麦克风权限并转发 onPermissionRequest，且页面为 <b>HTTPS</b>。
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
// ② 也可直接引入 SDK（此页演示能力探测；完整录制编排见 readme「脚本 SDK 用法」）
import { getMicBlockReason } from '@/uni_modules/uni-web-voice-input/js_sdk/uni-web-voice/index.js';
// ① 组件用法：显式导入（不依赖 easycom 扫描路径，最稳）
import UniWebVoiceInput from '@/uni_modules/uni-web-voice-input/components/uni-web-voice-input/uni-web-voice-input.vue';

// 审核 / 真机时换成你的真实签名接口
const SIGN_URL = 'https://your.domain/api/app/ai/asr/sign';

const result = ref('');
const partial = ref('');
const state = ref('idle');

const stateLabel = computed(
  () =>
    ({
      idle: '空闲',
      preparing: '准备中',
      recording: '录音中',
      recognizing: '识别中',
      canceled: '已取消',
    })[state.value] || state.value,
);

// 签名注入：返回 { url, expired?, voiceId? }
const getSign = async () => {
  const reason = getMicBlockReason();
  if (reason) throw new Error(reason);
  const [err, res] = await new Promise((resolve) => {
    uni.request({
      url: SIGN_URL,
      success: (r) => resolve([null, r]),
      fail: (e) => resolve([e]),
    });
  });
  if (err) throw new Error('签名请求失败，请检查 SIGN_URL 与网络');
  const body = res && res.data;
  const data = body && body.data ? body.data : body;
  if (!data || !data.url) throw new Error('签名响应缺少 url');
  return data;
};

const onResult = (t) => {
  result.value = t;
  partial.value = '';
};
const onPartial = (t) => (partial.value = t);
const onState = (s) => (state.value = s);
const onError = (msg) => uni.showToast({ title: msg, icon: 'none', duration: 3000 });
</script>

<style lang="scss" scoped>
.page {
  padding: 32rpx;
}
.title {
  font-size: 36rpx;
  font-weight: 600;
  color: #1d1e1f;
}
.tip {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #999;
}
.card {
  margin-top: 32rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: #ffffff;
}
.label {
  font-size: 24rpx;
  color: #999;
  margin-bottom: 12rpx;
}
.result {
  font-size: 32rpx;
  color: #1d1e1f;
  line-height: 1.5;
}
.result.placeholder {
  color: #bbb;
}
.meta {
  margin: 20rpx 0;
  display: flex;
  flex-direction: column;
}
.meta-item {
  font-size: 24rpx;
  color: #666;
}
.meta-item.partial {
  color: #087a57;
}
.hint {
  margin-top: 32rpx;
  font-size: 22rpx;
  color: #000000;
  line-height: 1.6;
}
</style>
