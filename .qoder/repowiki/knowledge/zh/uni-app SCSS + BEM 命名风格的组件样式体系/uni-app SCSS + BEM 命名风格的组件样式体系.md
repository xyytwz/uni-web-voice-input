---
kind: frontend_style
name: uni-app SCSS + BEM 命名风格的组件样式体系
category: frontend_style
scope:
    - '**'
source_files:
    - demo/src/uni.scss
    - demo/src/pages/index/index.vue
    - uni_modules/uni-web-voice-input/components/uni-web-voice-input/uni-web-voice-input.vue
---

## 1. 使用的系统与工具

- **框架**：基于 uni-app（Vue 3 `<script setup>`）+ Vite 构建。
- **样式语言**：SCSS（`lang="scss"`），通过 uni.scss 全局变量入口注入。
- **单位**：统一使用 `rpx`（uni-app 的响应式像素单位），适配多端屏幕。
- **CSS 模块化方式**：每个 `.vue` 文件内嵌 `<style lang="scss" scoped>`，无独立 CSS/SCSS 文件；未引入任何 UI 组件库或 CSS-in-JS 方案。
- **命名规范**：采用 BEM 风格（`uni-web-voice__bar`、`uni-web-voice__panel`、`.is-active`、`.is-cancel` 等修饰类）。

## 2. 关键文件

- `demo/src/uni.scss` — uni-app 全局 SCSS 变量入口，定义主题色与基础色。
- `demo/src/pages/index/index.vue` — H5 示例页面，展示组件用法及页面级样式。
- `uni_modules/uni-web-voice-input/components/uni-web-voice-input/uni-web-voice-input.vue` — SDK 核心组件，自带完整样式。

## 3. 架构与约定

### 设计令牌（Design Tokens）
全局变量集中在 `demo/src/uni.scss`：
```scss
$uni-color-primary: #087a57;
$uni-text-color: #1d1e1f;
$uni-bg-color: #f8f8f8;
```
注释明确说明该文件是「uni-app 全局 SCSS 变量入口，会被编译器自动注入各组件」。

### 颜色与视觉约定
- 主色：`#087a57`（绿色，用于实时识别文本高亮）。
- 文字色：`#1d1e1f`（正文）、`#666` / `#999`（次要信息）、`#bbb`（占位符）。
- 背景：`#f8f8f8`（页面）、`#ffffff`（卡片）、`rgba(0,0,0,0.35)`（遮罩）。
- 取消态：`#f53f3f`（红色）。
- 组件交互态：按住时背景切换为 `#e5f6ef`（浅绿）。

### 布局与尺寸
- 间距与字号统一使用 `rpx`（如 `padding: 32rpx`、`font-size: 30rpx`、`height: 88rpx`）。
- 圆角：按钮 `44rpx`（半椭圆）、面板 `24rpx`、卡片 `16rpx`。
- 遮罩层固定定位 `position: fixed; z-index: 9999`，确保浮层覆盖。

### 组件样式组织
组件 `uni-web-voice-input.vue` 将模板、逻辑与样式全部封装在一个文件中，样式块位于末尾 `<style lang="scss" scoped>`，通过 BEM 命名避免污染外部样式。组件暴露 `recorder`、`state` 两个实例属性（`defineExpose`），但样式完全内聚于组件自身。

## 4. 观察到的约定与约束

- **样式作用域**：所有 `<style>` 均带 `scoped`，组件样式不会泄漏到宿主页面。
- **BEM 命名**：组件内部类名遵循 `block__element--modifier` 形式（如 `uni-web-voice__bar.is-active`、`uni-web-voice__hint.is-cancel`）。
- **移动端交互兜底**：组件同时绑定 `touch*` 与 `mousedown/mouseup` 事件，并设置 `user-select: none`、`-webkit-touch-callout: none`、`-webkit-tap-highlight-color: transparent`，以屏蔽默认触摸行为。
- **无第三方样式依赖**：仓库未引入 Ant Design Vue、Vant、Tailwind 等任何 UI 库或原子化 CSS 框架，样式从零编写。
- **SCSS 变量集中管理**：全局主题色通过 uni.scss 注入，而非在组件内硬编码（尽管组件内部仍直接使用了十六进制色值，未引用 `$uni-*` 变量，这是当前实现的一个不一致点）。