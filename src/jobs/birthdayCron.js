require('dotenv').config();
const cron = require('node-cron');
const { Op, literal } = require('sequelize');
const Doctor = require('../models/Doctor');
const { pushToQueue } = require('../services/queueService');
const { formatPhone } = require('../services/dateUtils');

const MESSAGE_TYPES = [
  { field: 'birthday', type: 'birthday', template: process.env.BIRTHDAY_TEMPLATE, videoUrl: process.env.BIRTHDAY_URL },
  { field: 'anniversary', type: 'anniversary', template: process.env.ANNIVERSARY_TEMPLATE, videoUrl: process.env.ANNIVERSARY_URL },
  { field: 'clinic_anniversary', type: 'clinic_anniversary', template: process.env.CLINIC_ANNIVERSARY_TEMPLATE, videoUrl: process.env.CLINIC_ANNIVERSARY_URL },
];

async function checkAndQueueMessages() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePattern = `${month}-${day}`;

  // SQL-level filtering: only fetch doctors whose date matches today's month-day
  const orConditions = MESSAGE_TYPES.map(j =>
    literal(`DATE_FORMAT(\`${j.field}\`, '%m-%d') = '${datePattern}'`)
  );

  const doctors = await Doctor.findAll({
    where: {
      is_active: true,
      [Op.or]: orConditions,
    },
    attributes: ['id', 'name', 'phone', 'clinic_name', 'birthday', 'anniversary', 'clinic_anniversary'],
  });

  const tasks = [];

  for (const doctor of doctors) {
    for (const job of MESSAGE_TYPES) {
      if (!doctor[job.field]) continue;

      if (!job.template || !job.videoUrl) {
        console.warn(`[cron] Missing template/videoUrl for ${job.type} — add to .env`);
        continue;
      }

      tasks.push(
        pushToQueue({
          to: formatPhone(doctor.phone),
          templateName: job.template,
          bodyParameters: [{ type: 'text', text: doctor.name }],
          headerParameters: [{ type: 'video', video: { link: job.videoUrl } }],
          doctorId: doctor.id,
          doctorName: doctor.name,
          doctorPhone: doctor.phone,
          doctorBirthday: doctor.birthday,
          doctorAnniversary: doctor.anniversary,
          doctorClinicAnniversary: doctor.clinic_anniversary,
          doctorClinicName: doctor.clinic_name,
          type: job.type,
        }).then(() => console.log(`[cron] queued ${job.type} → ${doctor.name} (${doctor.phone})`))
          .catch(err => console.error(`[cron] queue-error ${job.type} → ${doctor.name}:`, err.message))
      );
    }
  }

  const results = await Promise.allSettled(tasks);
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`[cron] done — queued:${succeeded} failed:${failed} total:${results.length}`);
}

async function startCron() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] running daily job...');
    try {
      await checkAndQueueMessages();
    } catch (err) {
      console.error('[cron] error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });
  //  await checkAndQueueMessages();
  console.log('[cron] scheduled: daily at 9:00 AM IST');
}

module.exports = { startCron, checkAndQueueMessages };
