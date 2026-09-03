require('dotenv').config();
const cron = require('node-cron');
const Doctor = require('../models/Doctor');
const { pushToQueue } = require('../services/queueService');

const JOBS = [
  {
    field: 'birthday',
    type: 'birthday',
    template: () => process.env.BIRTHDAY_TEMPLATE,
    videoUrl: () => process.env.BIRTHDAY_URL,
  },
  {
    field: 'anniversary',
    type: 'anniversary',
    template: () => process.env.ANNIVERSARY_TEMPLATE,
    videoUrl: () => process.env.ANNIVERSARY_URL,
  },
  {
    field: 'clinic_anniversary',
    type: 'clinic_anniversary',
    template: () => process.env.CLINIC_ANNIVERSARY_TEMPLATE,
    videoUrl: () => process.env.CLINIC_ANNIVERSARY_URL,
  },
];

async function checkAndQueueMessages() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const doctors = await Doctor.findAll();

  for (const doctor of doctors) {
    for (const job of JOBS) {
      const dateValue = doctor[job.field];
      if (!dateValue) continue;

      const d = new Date(dateValue);
      if (String(d.getMonth() + 1).padStart(2, '0') !== month || String(d.getDate()).padStart(2, '0') !== day) continue;

      await pushToQueue({
        to: `+91${doctor.phone}`,
        templateName: job.template(),
        bodyParameters: [{ type: 'text', text: doctor.name }],
        headerParameters: [{ type: 'video', video: { link: job.videoUrl() } }],
        doctorId: doctor.id,
        doctorName: doctor.name,
        doctorPhone: doctor.phone,
        doctorBirthday: doctor.birthday,
        doctorAnniversary: doctor.anniversary,
        doctorClinicAnniversary: doctor.clinic_anniversary,
        doctorClinicName: doctor.clinic_name,
        type: job.type,
      });

      console.log(`Queued ${job.type} for ${doctor.name} (${doctor.phone})`);
    }
  }
}

async function startCron() {
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily cron...');
    try {
      await checkAndQueueMessages();
    } catch (err) {
      console.error('Cron error:', err.message);
    }
  });
  // await checkAndQueueMessages();
  console.log('Cron scheduled: daily at 9:00 AM');
}

module.exports = { startCron, checkAndQueueMessages };
