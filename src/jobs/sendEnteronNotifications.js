require('dotenv').config();
const cron = require('node-cron');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const EnteronDoctor = require('../models/EnteronDoctor');
const MessageLog = require('../models/MessageLog');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { formatPhone } = require('../services/dateUtils');

const TEMPLATE_NAME = 'digilabs_enteron_push_notification';
const IMAGE_URL = 'https://alembicdigilabs.in/images/download/Master_class_Flyer.png';
const MESSAGE_TYPE = 'enteron_push_notification';

async function sendEnteronNotifications() {
  try {
    await sequelize.authenticate();
    console.log('[enteron] Database connected');

    const doctors = await EnteronDoctor.findAll({
      attributes: ['id', 'doctor_name', 'contact', 'division'],
    });

    console.log(`[enteron] Found ${doctors.length} doctors`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const doctor of doctors) {
      const phone = formatPhone(doctor.contact);
      if (!phone) {
        console.log(`[enteron] Skipping ${doctor.doctor_name} - invalid phone: ${doctor.contact}`);
        skipped++;
        continue;
      }

      // Check if already sent (deduplication — webhook creates the row with sent_at)
      const existing = await MessageLog.findOne({
        where: {
          doctor_id: doctor.id,
          message_type: MESSAGE_TYPE,
          template_name: TEMPLATE_NAME,
          sent_at: { [Op.ne]: null },
        },
      });
      if (existing) {
        console.log(`[enteron] Skipping ${doctor.doctor_name} - already sent`);
        skipped++;
        continue;
      }

      const callbackMeta = {
        did: doctor.id,
        d: doctor.doctor_name,
        dp: doctor.contact,
        div: doctor.division,
        t: TEMPLATE_NAME,
        ty: MESSAGE_TYPE,
        ts: new Date().toISOString(),
      };

      try {
        await sendWhatsAppMessage(
          phone,
          TEMPLATE_NAME,
          [],
          [{ type: 'image', image: { link: IMAGE_URL } }],
          callbackMeta
        );

        console.log(`[enteron] Sent to ${doctor.doctor_name} (${phone})`);
        sent++;
      } catch (err) {
        const status = err.response?.status || 'N/A';
        const errData = err.response?.data;
        const firstError = errData?.errors?.[0] || {};
        const errorCode = firstError.code ? Number(firstError.code) : null;
        const errDetail = firstError.title || firstError.message || err.message;

        console.error(`[enteron] Failed ${doctor.doctor_name} (${phone}) http:${status} code:${errorCode} - ${errDetail}`);

        // Log failure — webhook may also deliver a 'failed' status later
        await MessageLog.safeCreate({
          doctor_id: doctor.id,
          doctor_name: doctor.doctor_name,
          doctor_phone: doctor.contact,
          division: doctor.division,
          message_type: MESSAGE_TYPE,
          template_name: TEMPLATE_NAME,
          recipient_id: phone.replace('+91', ''),
          failed_at: new Date(),
          retry_count: 0,
          error_code: errorCode,
          error_title: firstError.title || `HTTP ${status}`,
          error_message: errDetail,
          error_details: JSON.stringify(errData || {}).slice(0, 1000),
        });

        failed++;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[enteron] Done — sent:${sent} failed:${failed} skipped:${skipped} total:${doctors.length}`);
  } catch (err) {
    console.error('[enteron] Fatal error:', err.message);
  } finally {
    await sequelize.close();
  }
}

async function startCron() {
  cron.schedule('0 17 * * *', async () => {
    console.log('[enteron] running scheduled job at 5 PM IST...');
    try {
      await sendEnteronNotifications();
    } catch (err) {
      console.error('[enteron] error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });
  console.log('[enteron] scheduled: daily at 11:00 AM IST');
}

if (require.main === module) {
  startCron().catch(err => {
    console.error('[enteron] Failed to start cron:', err.message);
    process.exit(1);
  });
}

module.exports = { sendEnteronNotifications, startCron };