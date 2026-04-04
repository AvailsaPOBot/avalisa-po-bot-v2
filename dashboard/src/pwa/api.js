import axios from 'axios'

const api = axios.create({
  baseURL: 'https://avalisa-backend.onrender.com',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pwa_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
