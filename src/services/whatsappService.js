require('dotenv').config();
const axios = require('axios');
const https = require('https');

const httpClient = axios.create({
  baseURL: process.env.APIURL,
  timeout: 15000,
  httpsAgent: new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 50 }),
  headers: {
    accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

httpClient.interceptors.request.use(config => {
  config.headers.Authorization = process.env.AUTHENTICATION;
  return config;
});

async function sendWhatsAppMessage(to, templateName, bodyParameters = [], headerParameters = [], doctorMeta = {}) {
  const components = [];
  if (headerParameters.length > 0) components.push({ type: 'header', parameters: headerParameters });
  if (bodyParameters.length > 0) components.push({ type: 'body', parameters: bodyParameters });

  const payload = {
    to,
    type: 'template',
    source: 'external',
    template: {
      name: templateName,
      language: { code: 'en' },
      components,
    },
    metaData: {
      custom_callback_data: JSON.stringify(doctorMeta),
    },
  };

  const response = await httpClient.post('', payload);
  return response.data;
}

module.exports = { sendWhatsAppMessage };
