const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MessageLog = sequelize.define('MessageLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  message_id: { type: DataTypes.STRING, unique: true },
  doctor_id: { type: DataTypes.INTEGER },
  doctor_name: { type: DataTypes.STRING },
  doctor_phone: { type: DataTypes.STRING },
  doctor_birthday: { type: DataTypes.DATEONLY },
  doctor_anniversary: { type: DataTypes.DATEONLY },
  doctor_clinic_anniversary: { type: DataTypes.DATEONLY },
  doctor_clinic_name: { type: DataTypes.STRING },
  message_type: { type: DataTypes.ENUM('birthday', 'anniversary', 'clinic_anniversary', 'enteron_push_notification') },
  template_name: { type: DataTypes.STRING },
  recipient_id: { type: DataTypes.STRING },
  retry_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  billable: { type: DataTypes.BOOLEAN },
  category: { type: DataTypes.STRING },
  timestamp: { type: DataTypes.STRING },
  error_code: { type: DataTypes.INTEGER },
  error_title: { type: DataTypes.STRING },
  error_message: { type: DataTypes.TEXT },
  error_details: { type: DataTypes.TEXT },
  error_description: { type: DataTypes.TEXT },
  division: { type: DataTypes.STRING },
  doctor_is_doctor: { type: DataTypes.BOOLEAN, defaultValue: true },
  sent_at: { type: DataTypes.DATE },
  delivered_at: { type: DataTypes.DATE },
  read_at: { type: DataTypes.DATE },
  failed_at: { type: DataTypes.DATE },
}, {
  tableName: 'message_logs',
  timestamps: true,
});

// Upsert a row by message_id, setting the appropriate timestamp column based on status
MessageLog.upsertStatus = async function(data) {
  const { message_id, status, timestamp, ...rest } = data;
  if (!message_id) {
    // No message_id — fall back to plain create
    return this.create(data);
  }

  // Prefer the WhatsApp webhook timestamp (Unix epoch string), fall back to now
  const now = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  const updateFields = { ...rest };

  if (status === 'sent') updateFields.sent_at = now;
  else if (status === 'delivered') updateFields.delivered_at = now;
  else if (status === 'read') updateFields.read_at = now;
  else if (status === 'failed') updateFields.failed_at = now;

  const [instance, created] = await this.findOrCreate({
    where: { message_id },
    defaults: { message_id, ...updateFields },
  });

  if (!created) {
    await instance.update(updateFields);
  }
  return instance;
};

// Fallback for older DB schemas missing newer columns
MessageLog.safeCreate = async function(data) {
  try {
    return await this.create(data);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('retry_count') || msg.includes('doctor_clinic_name') ||
        msg.includes('division') || msg.includes('doctor_is_doctor') ||
        msg.includes('sent_at') || msg.includes('delivered_at') ||
        msg.includes('read_at') || msg.includes('failed_at') ||
        msg.includes('status')) {
      const safe = { ...data };
      delete safe.retry_count;
      delete safe.doctor_clinic_name;
      delete safe.division;
      delete safe.doctor_is_doctor;
      delete safe.sent_at;
      delete safe.delivered_at;
      delete safe.read_at;
      delete safe.failed_at;
      delete safe.status;
      return await this.create(safe);
    }
    throw err;
  }
};

module.exports = MessageLog;