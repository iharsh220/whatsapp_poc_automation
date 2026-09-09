require('dotenv').config();
const { popFromQueue, popDueRetries, pushToRetryQueue, MAX_RETRIES } = require('../services/queueService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const MessageLog = require('../models/MessageLog');

const CONCURRENCY = 5;

// Returns true if the original trigger date (today) is still today
function isSameDay(triggeredAt) {
  const origin = new Date(triggeredAt);
  const now = new Date();
  return (
    origin.getFullYear() === now.getFullYear() &&
    origin.getMonth() === now.getMonth() &&
    origin.getDate() === now.getDate()
  );
}

async function processMessage(message) {
  const {
    to, templateName, bodyParameters, headerParameters, type,
    doctorId, doctorName, doctorPhone, doctorBirthday,
    doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
    retryCount = 0,
    triggeredAt = new Date().toISOString(), // set on first attempt
  } = message;

  try {
    await sendWhatsAppMessage(to, templateName, bodyParameters, headerParameters, {
      doctorId, doctorName, doctorPhone, doctorBirthday,
      doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
      messageType: type, templateName,
      retryCount,
    });

    console.log(`[${retryCount > 0 ? `retry-${retryCount}` : 'sent'}] ${type} → ${to} (${doctorName})`);
  } catch (err) {
    const errorBody = err.response?.data;
    const firstError = errorBody?.errors?.[0] || {};

    console.error(`[failed] ${to} (${doctorName}) attempt:${retryCount + 1} - ${firstError.title || err.message}`);

    const nextRetry = retryCount + 1;
    const canRetry = nextRetry < MAX_RETRIES && isSameDay(triggeredAt);

    if (canRetry) {
      await pushToRetryQueue({
        ...message,
        retryCount: nextRetry,
        triggeredAt, // preserve original trigger date
      });
      console.log(`[queued-retry-${nextRetry}] ${to} (${doctorName}) - retrying in 3 hours`);
    } else {
      // Max retries exhausted OR next retry would be next day — save as permanently failed
      const reason = !isSameDay(triggeredAt) ? 'next-day-blocked' : 'max-retries-exhausted';
      console.log(`[permanently-failed:${reason}] ${to} (${doctorName}) after ${retryCount + 1} attempt(s)`);

      await saveFailedLog({
        doctorId, doctorName, doctorPhone, doctorBirthday,
        doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
        type, templateName, to, retryCount,
        firstError, err,
      });
    }
  }
}

async function saveFailedLog(data) {
  const { doctorId, doctorName, doctorPhone, doctorBirthday,
    doctorAnniversary, doctorClinicAnniversary, doctorClinicName,
    type, templateName, to, retryCount, firstError, err } = data;

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
    error_code: firstError.code || null,
    error_title: firstError.title || null,
    error_message: firstError.message || err.message || null,
    error_details: firstError.error_data?.details || null,
  });
}

async function runWorker() {
  console.log(`Worker started | concurrency: ${CONCURRENCY} | max retries: ${MAX_RETRIES} | retry gap: 3h | same-day only`);

  while (true) {
    try {
      const retries = await popDueRetries();
      for (const msg of retries) {
        // Block retry if it's now a different day from when it was triggered
        if (!isSameDay(msg.triggeredAt)) {
          console.log(`[blocked] ${msg.to} (${msg.doctorName}) - retry skipped, different day`);
          await saveFailedLog({
            doctorId: msg.doctorId, doctorName: msg.doctorName, doctorPhone: msg.doctorPhone,
            doctorBirthday: msg.doctorBirthday, doctorAnniversary: msg.doctorAnniversary,
            doctorClinicAnniversary: msg.doctorClinicAnniversary, doctorClinicName: msg.doctorClinicName,
            type: msg.type, templateName: msg.templateName, to: msg.to,
            retryCount: msg.retryCount, firstError: {}, err: { message: 'Retry blocked: next day' },
          });
          continue;
        }
        processMessage(msg);
      }

      const batch = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        const msg = await popFromQueue();
        if (!msg) break;
        batch.push({ ...msg, triggeredAt: new Date().toISOString() });
      }

      if (batch.length === 0) { await sleep(3000); continue; }

      await Promise.all(batch.map(processMessage));
      await sleep(1000);
    } catch (err) {
      console.error('Worker loop error:', err.message);
      await sleep(3000);
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

runWorker();
