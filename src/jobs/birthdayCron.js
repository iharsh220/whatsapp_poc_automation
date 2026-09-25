require('dotenv').config();
const cron = require('node-cron');
const { Op, literal } = require('sequelize');
const Doctor = require('../models/Doctor');
const { pushToQueue } = require('../services/queueService');
const { formatPhone } = require('../services/dateUtils');

const MESSAGE_TYPES = [
  {
    field: 'birthday',
    type: 'birthday',
    template: process.env.BIRTHDAY_TEMPLATE,
    videoUrlDoctor: process.env.BIRTHDAY_URL_DOCTOR,
    videoUrlSales: process.env.BIRTHDAY_URL_SALES,
  },
  {
    field: 'anniversary',
    type: 'anniversary',
    template: process.env.ANNIVERSARY_TEMPLATE,
    videoUrlDoctor: process.env.ANNIVERSARY_URL_DOCTOR,
    videoUrlSales: process.env.ANNIVERSARY_URL_SALES,
  },
  {
    field: 'clinic_anniversary',
    type: 'clinic_anniversary',
    template: process.env.CLINIC_ANNIVERSARY_TEMPLATE,
    videoUrlDoctor: process.env.CLINIC_ANNIVERSARY_URL_DOCTOR,
    videoUrlSales: process.env.CLINIC_ANNIVERSARY_URL_SALES,
  },
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
    attributes: ['id', 'name', 'phone', 'clinic_name', 'birthday', 'anniversary', 'clinic_anniversary', 'division', 'is_doctor'],
  });

  const tasks = [];

  for (const doctor of doctors) {
    for (const job of MESSAGE_TYPES) {
      const dateValue = doctor[job.field];
      if (!dateValue) continue;

      // Verify THIS specific date is today (SQL returned doctor for any matching date)
      const d = new Date(dateValue);
      if (String(d.getMonth() + 1).padStart(2, '0') !== month ||
        String(d.getDate()).padStart(2, '0') !== day) continue;

      const isDoctor = doctor.is_doctor ? 1 : 0;
      console.log(isDoctor);
      const videoUrl = isDoctor ? job.videoUrlDoctor : job.videoUrlSales;
      console.log(videoUrl);
      if (!job.template || !videoUrl) {
        console.warn(`[cron] Missing template/videoUrl for ${job.type} (is_doctor=${isDoctor}) — add to .env`);
        continue;
      }


      const messageData = {
        to: formatPhone(doctor.phone),
        templateName: job.template,
        bodyParameters: [{ type: 'text', text: doctor.name }],
        headerParameters: [{ type: 'video', video: { link: videoUrl } }],
        doctorId: doctor.id,
        doctorName: doctor.name,
        doctorPhone: doctor.phone,
        doctorBirthday: job.type === 'birthday' ? doctor.birthday : null,
        doctorAnniversary: job.type === 'anniversary' ? doctor.anniversary : null,
        doctorClinicAnniversary: job.type === 'clinic_anniversary' ? doctor.clinic_anniversary : null,
        doctorClinicName: doctor.clinic_name,
        doctorDivision: doctor.division,
        doctorIsDoctor: isDoctor,
        type: job.type,
      };
      // console.log(messageData.headerParameters);
      tasks.push(
        pushToQueue(messageData)
          .then(queued => {
            if (queued) console.log(`[cron] queued ${job.type} → ${doctor.name} (${doctor.phone}) is_doctor=${isDoctor}`);
            return queued;
          })
          .catch(err => {
            console.error(`[cron] queue-error ${job.type} → ${doctor.name}:`, err.message);
            return null;
          })
      );
    }
  }

  const results = await Promise.allSettled(tasks);
  const queued = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const skipped = results.filter(r => r.status === 'fulfilled' && r.value === false).length;
  const failed = results.filter(r => r.status === 'fulfilled' && r.value === null).length +
    results.filter(r => r.status === 'rejected').length;
  console.log(`[cron] done — queued:${queued} skipped:${skipped} failed:${failed} total:${results.length}`);
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
  // await checkAndQueueMessages();
  console.log('[cron] scheduled: daily at 9:00 AM IST');
}

module.exports = { startCron, checkAndQueueMessages };