require('dotenv').config();
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function sendWhatsAppMessage(to, templateName, bodyParameters = [], headerParameters = [], doctorMeta = {}) {
  const components = [];

  if (headerParameters.length > 0) {
    components.push({ type: 'header', parameters: headerParameters });
  }

  if (bodyParameters.length > 0) {
    components.push({ type: 'body', parameters: bodyParameters });
  }

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

  const response = await axios.post(process.env.APIURL, payload, {
    httpsAgent,
    headers: {
      accept: 'application/json',
      Authorization: process.env.AUTHENTICATION,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

module.exports = { sendWhatsAppMessage };
