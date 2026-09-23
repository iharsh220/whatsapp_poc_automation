require('dotenv').config();
const sequelize = require('../config/database');
const MessageLog = require('../models/MessageLog');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { formatPhone } = require('../services/dateUtils');

const TEMPLATE_NAME = 'digilabs_enteron_push_notification';
const IMAGE_URL = 'https://alembicdigilabs.in/images/download/Master_class_Flyer.png';
const MESSAGE_TYPE = 'enteron_push_notification';

const TEST_NUMBERS = [
  { name: 'Test Doctor 1', contact: '+918080302041', division: 'Test' },
  { name: 'Test Doctor 2', contact: '+917039294919', division: 'Test' },
];

async function sendTestNotifications() {
  try {
    await sequelize.authenticate();
    console.log('[test] Database connected');

    let sent = 0;
    let failed = 0;

    for (const doctor of TEST_NUMBERS) {
      const phone = formatPhone(doctor.contact);
      if (!phone) {
        console.log(`[test] Skipping ${doctor.name} - invalid phone: ${doctor.contact}`);
        continue;
      }

      const callbackMeta = {
        did: 0,
        d: doctor.name,
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

        await MessageLog.safeCreate({
          doctor_id: 0,
          doctor_name: doctor.name,
          doctor_phone: doctor.contact,
          division: doctor.division,
          message_type: MESSAGE_TYPE,
          template_name: TEMPLATE_NAME,
          recipient_id: phone.replace('+91', ''),
          sent_at: new Date(),
          retry_count: 0,
        });

        console.log(`[test] Sent to ${doctor.name} (${phone})`);
        sent++;
      } catch (err) {
        const status = err.response?.status || 'N/A';
        const errData = err.response?.data;
        const firstError = errData?.errors?.[0] || {};
        const errorCode = firstError.code ? Number(firstError.code) : null;
        const errDetail = firstError.title || firstError.message || err.message;

        console.error(`[test] Failed ${doctor.name} (${phone}) http:${status} code:${errorCode} - ${errDetail}`);

        await MessageLog.safeCreate({
          doctor_id: 0,
          doctor_name: doctor.name,
          doctor_phone: doctor.contact,
          division: doctor.division,
          message_type: MESSAGE_TYPE,
          template_name: TEMPLATE_NAME,
          recipient_id: phone.replace('+91', ''),
          failed_at: new Date(),
          retry_count: 0,
          error_code: errorCode,
          error_description: errDetail,
        });

        failed++;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[test] Done — sent:${sent} failed:${failed}`);
  } catch (err) {
    console.error('[test] Fatal error:', err.message);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

sendTestNotifications();