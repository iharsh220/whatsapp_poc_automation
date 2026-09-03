require('dotenv').config();
const { popFromQueue, popDueRetries, pushToRetryQueue, MAX_RETRIES } = require('../services/queueService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const MessageLog = require('../models/MessageLog');

const CONCURRENCY = 5;

async function processMessage(message) {
  const {
    to, templateName, bodyParameters, headerParameters, type,
    doctorId, doctorName, doctorPhone, doctorBirthday,
    doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
    retryCount = 0,
  } = message;

  try {
    await sendWhatsAppMessage(to, templateName, bodyParameters, headerParameters, {
      doctorId, doctorName, doctorPhone, doctorBirthday,
      doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
      messageType: type, templateName,
    });

    console.log(`[${retryCount > 0 ? `retry-${retryCount}` : 'sent'}] ${type} to ${to} (${doctorName})`);
  } catch (err) {
    const errorBody = err.response?.data;
    const firstError = errorBody?.errors?.[0] || {};

    console.error(`[failed] ${to} (${doctorName}) retry:${retryCount} - ${firstError.title || err.message}`);

    if (retryCount < MAX_RETRIES) {
      await pushToRetryQueue({ ...message, retryCount: retryCount + 1 });
      console.log(`[queued-retry-${retryCount + 1}] ${to} (${doctorName}) - retrying in 5 min`);
    } else {
      // Max retries exhausted - save to DB as permanently failed
      await MessageLog.create({
        doctor_id: doctorId,
        doctor_name: doctorName,
        doctor_phone: doctorPhone,
        doctor_birthday: doctorBirthday,
        doctor_anniversary: doctorAnniversary,
        doctor_clinic_anniversary: doctorClinicAnniversary,
        doctor_clinic_name: doctorClinicName,
        message_type: type,
        template_name: templateName,
        recipient_id: to.replace('+91', ''),
        status: 'failed',
        retry_count: retryCount,
        error_code: firstError.code || null,
        error_title: firstError.title || null,
        error_message: firstError.message || err.message || null,
        error_details: firstError.error_data?.details || null,
      });

      console.log(`[permanently-failed] ${to} (${doctorName}) - saved to DB`);
    }
  }
}

async function runWorker() {
  console.log(`Worker started with concurrency: ${CONCURRENCY}`);

  while (true) {
    try {
      // Process due retries first
      const retries = await popDueRetries();
      for (const msg of retries) {
        processMessage(msg); // fire and forget - concurrency handles it
      }

      // Process main queue with concurrency
      const batch = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        const msg = await popFromQueue();
        if (!msg) break;
        batch.push(msg);
      }

      if (batch.length === 0) {
        await sleep(3000);
        continue;
      }

      await Promise.all(batch.map(processMessage));
      await sleep(1000); // 1 sec gap between batches

    } catch (err) {
      console.error('Worker loop error:', err.message);
      await sleep(3000);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

runWorker();
