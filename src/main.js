import { createApp } from 'vue'
import App from './App.vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
// 全局 CSS 变量（--menu-width / --top-height），必须在全局作用域引入，
// 否则写在 scoped 样式里的 :root 选择器不会生效。
import './assets/css/vars.css'
// 两套本地图标字体：iconfont = 工具图标，common = 通用图标（明暗/窗口按钮等）。
// 同样必须全局引入——放进 scoped 样式会带上 data-v 属性，匹配不到组件里的 <i class="iconfont">。
import './assets/iconfont/iconfont.css'
import './assets/common/iconfont.css'
import router from './router'

const app = createApp(App)

app.use(Antd)
app.use(router)

app.mount('#app')
