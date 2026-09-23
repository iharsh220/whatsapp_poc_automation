require('dotenv').config();
const redis = require('../config/redis');
const { popFromQueue, popDueRetries, MAX_RETRIES } = require('../services/queueService');
const { sendWhatsAppMessage, getMessageId } = require('../services/whatsappService');
const { isSameDay } = require('../services/dateUtils');
const sequelize = require('../config/database');

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 5;

async function processMessage(message) {
  const {
    to, templateName, bodyParameters, headerParameters, type,
    doctorId, doctorName, doctorPhone, doctorBirthday,
    doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
    doctorDivision, doctorIsDoctor,
    retryCount = 0,
    triggeredAt = new Date().toISOString(),
  } = message;

  const callbackMeta = {
    did: doctorId,
    d: doctorName,
    dp: doctorPhone,
    db: doctorBirthday,
    da: doctorAnniversary,
    dca: doctorClinicAnniversary,
    dcn: doctorClinicName,
    div: doctorDivision,
    did2: doctorIsDoctor,
    t: templateName,
    ty: type,
    rc: retryCount,
    ts: triggeredAt,
  };

  try {
    const apiResponse = await sendWhatsAppMessage(to, templateName, bodyParameters, headerParameters, callbackMeta);
    const messageId = getMessageId(apiResponse);
    const label = retryCount > 0 ? `retry-${retryCount}` : 'sent';
    console.log(`[${label}] ${type} → ${to} (${doctorName}) | webhook_message_id:${messageId || 'missing'}`);
  } catch (err) {
    const status = err.response?.status || 'N/A';
    const errData = err.response?.data;
    const firstError = errData?.errors?.[0] || {};
    const errorCode = firstError.code ? Number(firstError.code) : null;
    const errDetail = firstError.title || firstError.message || err.message;

    console.error(`[send-error] ${to} (${doctorName}) attempt:${retryCount + 1} http:${status} code:${errorCode} - ${errDetail}`);
    if (errData && !errData.errors) {
      console.error(`[send-error-details] ${JSON.stringify(errData).slice(0, 500)}`);
    }
  }
}

async function processRetries() {
  while (true) {
    const retries = await popDueRetries(CONCURRENCY);
    if (retries.length === 0) break;

    for (const msg of retries) {
      if (msg.triggeredAt && !isSameDay(msg.triggeredAt)) {
        console.log(`[blocked] ${msg.to} (${msg.doctorName}) - retry skipped, different day`);
        continue;
      }
      processMessage(msg).catch(e => console.error('[retry-process-error]', e.message));
    }
  }
}

async function processMainQueue() {
  const batch = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const msg = await popFromQueue();
    if (!msg) break;
    batch.push({ ...msg, triggeredAt: new Date().toISOString() });
  }

  if (batch.length > 0) {
    await Promise.allSettled(batch.map(processMessage));
  }
}

async function runWorker() {
  await sequelize.authenticate();
  console.log(`[worker] started | concurrency:${CONCURRENCY} | blpop-timeout:10s`);
  console.log(`[worker] retry logic: ${MAX_RETRIES} retries | 3h gap | same-day only`);

  while (true) {
    try {
      await processRetries();
      await processMainQueue();
    } catch (err) {
      console.error('[worker-loop-error]', err.message);
      await sleep(5000);
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

runWorker().catch(err => {
  console.error('[worker-fatal]', err.message);
  process.exit(1);
});
