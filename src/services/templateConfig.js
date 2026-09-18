require('dotenv').config();

const TEMPLATE_CONFIG = {
  [process.env.BIRTHDAY_TEMPLATE]: { videoUrl: process.env.BIRTHDAY_URL, type: 'birthday' },
  [process.env.ANNIVERSARY_TEMPLATE]: { videoUrl: process.env.ANNIVERSARY_URL, type: 'anniversary' },
  [process.env.CLINIC_ANNIVERSARY_TEMPLATE]: { videoUrl: process.env.CLINIC_ANNIVERSARY_URL, type: 'clinic_anniversary' },
};

function getVideoUrl(templateName) {
  return TEMPLATE_CONFIG[templateName]?.videoUrl || null;
}

function getType(templateName) {
  return TEMPLATE_CONFIG[templateName]?.type || null;
}

module.exports = { TEMPLATE_CONFIG, getVideoUrl, getType };
