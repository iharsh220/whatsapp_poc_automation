const express = require('express');
const router = express.Router();
const MessageLog = require('../models/MessageLog');

router.post('/status_callback', async (req, res) => {
  const statuses = req.body.statuses || [];

  for (const s of statuses) {
    try {
      let meta = {};
      try { meta = JSON.parse(s.custom_callback_data || '{}'); } catch {}

      const firstError = s.errors?.[0] || {};

      await MessageLog.create({
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
        error_code: firstError.code || null,
        error_title: firstError.title || null,
        error_message: firstError.message || null,
        error_details: firstError.error_data?.details || null,
      });

      console.log(`${s.recipient_id} - ${s.status} - ${meta.doctorName || 'unknown'}`);
    } catch (err) {
      console.error(`Error saving ${s.id}:`, err.message);
    }
  }

  return res.status(200).json({ status: 'received' });
});

module.exports = router;
