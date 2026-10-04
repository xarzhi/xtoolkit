import { createApp } from 'vue'
import App from './App.vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
// 全局样式：reset（清掉浏览器默认边距 + 锁住整页滚动）与主题变量。
// 必须在这里（全局作用域）引入——写在 App.vue 的 <style scoped> 里，
// Vue 会给选择器补上 [data-v-xxx]，而 html / body / #app 身上没有这个属性，
// 那些规则永远匹配不到，等于没写。
import './assets/css/reset.scss'
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
