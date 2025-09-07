import { createApp } from 'vue'
import { createPinia } from 'pinia'
// import './assets/main.css' // Remove this line if you don't have a CSS file
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
