import { createApp } from 'vue'
import App from './App.vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
// 全局 CSS 变量（--menu-width / --top-height），必须在全局作用域引入，
// 否则写在 scoped 样式里的 :root 选择器不会生效。
import './assets/css/vars.css'
import router from './router'

const app = createApp(App)

app.use(Antd)
app.use(router)

app.mount('#app')
