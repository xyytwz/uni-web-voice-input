<template>
  <view class="page">
    <view class="tip">按住下方按钮说话，松开发送</view>

    <view class="result">
      <text v-if="result">{{ result }}</text>
      <text v-else class="placeholder">识别结果将显示在这里</text>
    </view>

    <!-- uni_modules 组件免注册，直接用标签 -->
    <uni-web-voice-input :sign-url="signUrl" @result="onResult" @error="onError" @state="onState" />
  </view>
</template>

<script setup>
import { ref } from 'vue';

// 审核 demo 需换成一个真实可返回 { url } 的签名地址
const signUrl = 'https://your.domain/api/app/ai/asr/sign';

const result = ref('');
const state = ref('idle');

const onResult = (text) => (result.value = text);
const onState = (s) => (state.value = s);
const onError = (msg) => uni.showToast({ title: msg, icon: 'none' });
</script>

<style lang="scss" scoped>
.page {
  padding: 32rpx;
}
.tip {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 24rpx;
}
.result {
  min-height: 120rpx;
  padding: 24rpx;
  margin-bottom: 48rpx;
  border-radius: 16rpx;
  background: #f7f8fa;
  font-size: 30rpx;
  color: #1d1e1f;
}
.placeholder {
  color: #bbb;
}
</style>
