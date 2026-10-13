<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app';

onLaunch(() => {
  console.log('[voice-demo] launch');
});
onShow(() => {
  console.log('[voice-demo] show');
});
</script>

<style>
page {
  background-color: #f8f8f8;
}
</style>
