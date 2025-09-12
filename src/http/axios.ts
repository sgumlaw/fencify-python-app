import axios from 'axios'
import http from 'http'
import https from 'https'

export const httpClient = axios.create({
  timeout: 25_000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 }),
})
