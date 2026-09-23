require('dotenv').config();
const { sendWhatsAppMessage, getMessageId } = require('../services/whatsappService');
const { formatPhone } = require('../services/dateUtils');

const TEMPLATE_NAME = 'digilabs_enteron_push_notification';
const IMAGE_URL = 'https://alembicdigilabs.in/images/download/Master_class_Flyer.png';
const MESSAGE_TYPE = 'enteron_push_notification';

const TEST_NUMBERS = [
  { name: 'Test Doctor 1', contact: '+918080302041', division: 'Test' },
  { name: 'Test Doctor 2', contact: '+917039294919', division: 'Test' },
];

async function sendTestNotifications() {
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
      const apiResponse = await sendWhatsAppMessage(
        phone,
        TEMPLATE_NAME,
        [],
        [{ type: 'image', image: { link: IMAGE_URL } }],
        callbackMeta
      );
      const messageId = getMessageId(apiResponse);

      console.log(`[test] Sent to ${doctor.name} (${phone}) | webhook_message_id:${messageId || 'missing'}`);
      sent++;
    } catch (err) {
      const status = err.response?.status || 'N/A';
      const errData = err.response?.data;
      const firstError = errData?.errors?.[0] || {};
      const errorCode = firstError.code ? Number(firstError.code) : null;
      const errDetail = firstError.title || firstError.message || err.message;

      console.error(`[test] Failed ${doctor.name} (${phone}) http:${status} code:${errorCode} - ${errDetail}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[test] Done — sent:${sent} failed:${failed}`);
}

sendTestNotifications().catch(err => {
  console.error('[test] Fatal error:', err.message);
  process.exit(1);
});
