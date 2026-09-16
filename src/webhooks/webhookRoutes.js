const express = require('express');
const router = express.Router();
const MessageLog = require('../models/MessageLog');
const { pushToRetryQueue, MAX_RETRIES } = require('../services/queueService');
const { isSameDay, formatPhone } = require('../services/dateUtils');

const RETRYABLE_ERROR_CODES = new Set([131049, 131042, 131026, 131000, 131005]);

router.post('/status_callback', async (req, res) => {
  // Respond immediately — never make WhatsApp wait
  res.status(200).json({ status: 'received' });

  const statuses = req.body.statuses || [];

  for (const s of statuses) {
    try {
      let meta = {};
      try { meta = JSON.parse(s.custom_callback_data || '{}'); } catch {}

      const firstError = s.errors?.[0] || {};
      const errorCode = firstError.code ? Number(firstError.code) : null;

      await MessageLog.safeCreate({
        message_id: s.id,
        doctor_id: meta.doctorId || null,
        doctor_name: meta.doctorName || null,
        doctor_phone: meta.doctorPhone || null,
        doctor_birthday: meta.doctorBirthday || null,
        doctor_anniversary: meta.doctorAnniversary || null,
        doctor_clinic_anniversary: meta.doctorClinicAnniversary || null,
        doctor_clinic_name: meta.doctorClinicName || null,
        message_type: meta.messageType || null,
        template_name: meta.templateName || null,
        recipient_id: s.recipient_id,
        status: s.status,
        retry_count: meta.retryCount || 0,
        billable: s.pricing?.billable ?? null,
        category: s.pricing?.category ?? null,
        timestamp: s.timestamp,
        error_code: errorCode,
        error_title: firstError.title || null,
        error_message: firstError.message || null,
        error_details: firstError.error_data?.details || null,
      });

      // Retry logic: retryable errors only, same-day, under max retries
      if (s.status === 'failed' && errorCode && RETRYABLE_ERROR_CODES.has(errorCode)) {
        const retryCount = meta.retryCount || 0;
        const triggeredAt = meta.triggeredAt || new Date().toISOString();

        if (retryCount < MAX_RETRIES && isSameDay(triggeredAt)) {
          await pushToRetryQueue({
            to: formatPhone(s.recipient_id),
            templateName: meta.templateName,
            bodyParameters: meta.bodyParameters || [],
            headerParameters: meta.headerParameters || [],
            doctorId: meta.doctorId,
            doctorName: meta.doctorName,
            doctorPhone: meta.doctorPhone,
            doctorBirthday: meta.doctorBirthday,
            doctorAnniversary: meta.doctorAnniversary,
            doctorClinicAnniversary: meta.doctorClinicAnniversary,
            doctorClinicName: meta.doctorClinicName,
            type: meta.messageType,
            retryCount: retryCount + 1,
            triggeredAt,
          });
          console.log(`[retry-queued] ${s.recipient_id} (${meta.doctorName}) retry:${retryCount + 1} error:${errorCode}`);
        } else {
          const reason = isSameDay(triggeredAt) ? 'max-retries-exhausted' : 'next-day-blocked';
          console.log(`[permanently-failed:${reason}] ${s.recipient_id} (${meta.doctorName}) error:${errorCode}`);
        }
      }

      console.log(`[webhook] ${s.recipient_id} → ${s.status}${errorCode ? ` (err:${errorCode})` : ''} | ${meta.doctorName || 'unknown'}`);
    } catch (err) {
      console.error(`[webhook-error] ${s.id}:`, err.message);
    }
  }
});

module.exports = router;
