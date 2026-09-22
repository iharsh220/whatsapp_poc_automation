const express = require('express');
const router = express.Router();
const MessageLog = require('../models/MessageLog');
const { pushToRetryQueue, MAX_RETRIES } = require('../services/queueService');
const { isSameDay, formatPhone } = require('../services/dateUtils');
const { getVideoUrl } = require('../services/templateConfig');

const RETRYABLE_ERROR_CODES = new Set([131049, 131042, 131026, 131000, 131005]);

// Expand compact callback data back to full meta
function expandMeta(cb) {
  const doctorName = cb.d || null;
  const templateName = cb.t || null;
  const videoUrl = getVideoUrl(templateName);

  return {
    doctorId: cb.did || null,
    doctorName: doctorName,
    doctorPhone: cb.dp || null,
    doctorBirthday: cb.db || null,
    doctorAnniversary: cb.da || null,
    doctorClinicAnniversary: cb.dca || null,
    doctorClinicName: cb.dcn || null,
    doctorDivision: cb.div ?? null,
    doctorIsDoctor: cb.did2 !== undefined ? cb.did2 : null,
    templateName: templateName,
    messageType: cb.ty || null,
    retryCount: cb.rc || 0,
    triggeredAt: cb.ts || new Date().toISOString(),
    bodyParameters: doctorName ? [{ type: 'text', text: doctorName }] : [],
    headerParameters: videoUrl ? [{ type: 'video', video: { link: videoUrl } }] : [],
  };
}

router.post('/status_callback', async (req, res) => {
  // Respond immediately — never make WhatsApp wait
  res.status(200).json({ status: 'received' });

  const statuses = req.body.statuses || [];
  console.log(req.body);
  for (const s of statuses) {
    try {
      let cb = {};
      try { cb = JSON.parse(s.custom_callback_data || '{}'); } catch { }

      const meta = expandMeta(cb);
      const firstError = s.errors?.[0] || {};
      const errorCode = firstError.code ? Number(firstError.code) : null;
      // console.log(meta);
      // Save to DB
      await MessageLog.safeCreate({
        message_id: s.id,
        doctor_id: meta.doctorId,
        doctor_name: meta.doctorName,
        doctor_phone: meta.doctorPhone,
        doctor_birthday: meta.doctorBirthday,
        doctor_anniversary: meta.doctorAnniversary,
        doctor_clinic_anniversary: meta.doctorClinicAnniversary,
        doctor_clinic_name: meta.doctorClinicName,
        division: meta.doctorDivision ?? null,
        doctor_is_doctor: meta.doctorIsDoctor !== undefined ? meta.doctorIsDoctor : null,
        message_type: meta.messageType,
        template_name: meta.templateName,
        recipient_id: s.recipient_id,
        status: s.status,
        retry_count: meta.retryCount,
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
        if (meta.retryCount < MAX_RETRIES && isSameDay(meta.triggeredAt)) {
          await pushToRetryQueue({
            to: formatPhone(s.recipient_id),
            templateName: meta.templateName,
            bodyParameters: meta.bodyParameters,
            headerParameters: meta.headerParameters,
            doctorId: meta.doctorId,
            doctorName: meta.doctorName,
            doctorPhone: meta.doctorPhone,
            doctorBirthday: meta.doctorBirthday,
            doctorAnniversary: meta.doctorAnniversary,
            doctorClinicAnniversary: meta.doctorClinicAnniversary,
            doctorClinicName: meta.doctorClinicName,
            doctorDivision: meta.doctorDivision,
            doctorIsDoctor: meta.doctorIsDoctor,
            type: meta.messageType,
            retryCount: meta.retryCount + 1,
            triggeredAt: meta.triggeredAt,
          });
          console.log(`[retry-queued] ${s.recipient_id} (${meta.doctorName}) retry:${meta.retryCount + 1} error:${errorCode}`);
        } else {
          const reason = isSameDay(meta.triggeredAt) ? 'max-retries-exhausted' : 'next-day-blocked';
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
