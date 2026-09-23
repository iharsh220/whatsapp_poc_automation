require('dotenv').config();
const cron = require('node-cron');
const EnteronDoctor = require('../models/EnteronDoctor');
const Doctor = require('../models/Doctor');
const { sendWhatsAppMessage, getMessageId } = require('../services/whatsappService');
const { formatPhone } = require('../services/dateUtils');

const TEMPLATE_NAME = 'digilabs_enteron_push_notification';
const IMAGE_URL = 'https://alembicdigilabs.in/images/download/Master_class_Flyer.png';
const MESSAGE_TYPE = 'enteron_push_notification';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function recipientId(phone) {
  const value = normalizePhone(phone);
  return value.startsWith('91') && value.length === 12 ? value.slice(2) : value;
}

function buildDoctorDetails(enteronDoctor, doctorsByPhone) {
  const key = recipientId(enteronDoctor.contact);
  const doctor = doctorsByPhone.get(key) || null;

  return {
    doctorId: doctor?.id || enteronDoctor.id,
    doctorName: doctor?.name || enteronDoctor.doctor_name,
    doctorPhone: doctor?.phone || enteronDoctor.contact,
    doctorBirthday: doctor?.birthday || null,
    doctorAnniversary: doctor?.anniversary || null,
    doctorClinicAnniversary: doctor?.clinic_anniversary || null,
    doctorClinicName: doctor?.clinic_name || null,
    doctorDivision: doctor?.division || enteronDoctor.division,
    doctorIsDoctor: doctor?.is_doctor ?? true,
  };
}

async function sendEnteronNotifications() {
  try {
    const [enteronDoctors, doctors] = await Promise.all([
      EnteronDoctor.findAll({
        attributes: ['id', 'doctor_name', 'contact', 'division'],
      }),
      Doctor.findAll({
        attributes: ['id', 'name', 'phone', 'clinic_name', 'birthday', 'anniversary', 'clinic_anniversary', 'division', 'is_doctor'],
      }),
    ]);

    const doctorsByPhone = new Map(
      doctors.map(doctor => [recipientId(doctor.phone), doctor])
    );

    console.log(`[enteron] Found ${enteronDoctors.length} doctors`);

    let sent = 0;
    let failed = 0;

    for (const enteronDoctor of enteronDoctors) {
      const phone = formatPhone(enteronDoctor.contact);
      if (!phone) {
        console.log(`[enteron] Skipping ${enteronDoctor.doctor_name} - invalid phone: ${enteronDoctor.contact}`);
        continue;
      }

      const details = buildDoctorDetails(enteronDoctor, doctorsByPhone);
      const callbackMeta = {
        did: details.doctorId,
        d: details.doctorName,
        dp: details.doctorPhone,
        db: details.doctorBirthday,
        da: details.doctorAnniversary,
        dca: details.doctorClinicAnniversary,
        dcn: details.doctorClinicName,
        div: details.doctorDivision,
        did2: details.doctorIsDoctor,
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

        console.log(`[enteron] Sent to ${details.doctorName} (${phone}) | webhook_message_id:${messageId || 'missing'}`);
        sent++;
      } catch (err) {
        const status = err.response?.status || 'N/A';
        const errData = err.response?.data;
        const firstError = errData?.errors?.[0] || {};
        const errorCode = firstError.code ? Number(firstError.code) : null;
        const errDetail = firstError.title || firstError.message || err.message;

        console.error(`[enteron] Failed ${details.doctorName} (${phone}) http:${status} code:${errorCode} - ${errDetail}`);
        failed++;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[enteron] Done — sent:${sent} failed:${failed} total:${enteronDoctors.length}`);
  } catch (err) {
    console.error('[enteron] Fatal error:', err.message);
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
  console.log('[enteron] scheduled: daily at 5:00 PM IST');
}

if (require.main === module) {
  startCron().catch(err => {
    console.error('[enteron] Failed to start cron:', err.message);
    process.exit(1);
  });
}

module.exports = { sendEnteronNotifications, startCron };
