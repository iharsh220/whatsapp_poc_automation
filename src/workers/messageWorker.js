require('dotenv').config();
const { popFromQueue, popDueRetries, MAX_RETRIES } = require('../services/queueService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { isSameDay } = require('../services/dateUtils');
const MessageLog = require('../models/MessageLog');
const sequelize = require('../config/database');

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 5;

async function processMessage(message) {
  const {
    to, templateName, bodyParameters, headerParameters, type,
    doctorId, doctorName, doctorPhone, doctorBirthday,
    doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
    retryCount = 0,
    triggeredAt = new Date().toISOString(),
  } = message;

  const meta = {
    doctorId, doctorName, doctorPhone, doctorBirthday,
    doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
    messageType: type, templateName,
    retryCount, triggeredAt,
    bodyParameters, headerParameters,
  };

  try {
    await sendWhatsAppMessage(to, templateName, bodyParameters, headerParameters, meta);
    const label = retryCount > 0 ? `retry-${retryCount}` : 'sent';
    console.log(`[${label}] ${type} → ${to} (${doctorName})`);
  } catch (err) {
    const firstError = err.response?.data?.errors?.[0] || {};
    const errorCode = firstError.code ? Number(firstError.code) : null;
    console.error(`[send-error] ${to} (${doctorName}) attempt:${retryCount + 1} code:${errorCode} - ${firstError.title || err.message}`);

    await MessageLog.safeCreate({
      doctor_id: doctorId || null,
      doctor_name: doctorName || null,
      doctor_phone: doctorPhone || null,
      doctor_birthday: doctorBirthday || null,
      doctor_anniversary: doctorAnniversary || null,
      doctor_clinic_anniversary: doctorClinicAnniversary || null,
      doctor_clinic_name: doctorClinicName || null,
      message_type: type || null,
      template_name: templateName || null,
      recipient_id: to ? to.replace('+91', '') : null,
      status: 'failed',
      retry_count: retryCount,
      error_code: errorCode,
      error_title: firstError.title || null,
      error_message: firstError.message || err.message || null,
      error_details: firstError.error_data?.details || null,
    });
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
      // 1. Process all due retries first (priority)
      await processRetries();

      // 2. Process main queue (BLPOP blocks up to 10s when empty)
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
