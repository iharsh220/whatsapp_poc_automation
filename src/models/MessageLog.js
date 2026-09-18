const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MessageLog = sequelize.define('MessageLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  message_id: { type: DataTypes.STRING },
  doctor_id: { type: DataTypes.INTEGER },
  doctor_name: { type: DataTypes.STRING },
  doctor_phone: { type: DataTypes.STRING },
  doctor_birthday: { type: DataTypes.DATEONLY },
  doctor_anniversary: { type: DataTypes.DATEONLY },
  doctor_clinic_anniversary: { type: DataTypes.DATEONLY },
  doctor_clinic_name: { type: DataTypes.STRING },
  message_type: { type: DataTypes.ENUM('birthday', 'anniversary', 'clinic_anniversary') },
  template_name: { type: DataTypes.STRING },
  recipient_id: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('sent', 'delivered', 'read', 'failed') },
  retry_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  billable: { type: DataTypes.BOOLEAN },
  category: { type: DataTypes.STRING },
  timestamp: { type: DataTypes.STRING },
  error_code: { type: DataTypes.INTEGER },
  error_title: { type: DataTypes.STRING },
  error_message: { type: DataTypes.TEXT },
  error_details: { type: DataTypes.TEXT },
  doctor_division: { type: DataTypes.STRING },
  doctor_is_doctor: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'message_logs',
  timestamps: true,
});

// Fallback for older DB schemas missing retry_count / doctor_clinic_name columns
MessageLog.safeCreate = async function(data) {
  try {
    return await this.create(data);
  } catch (err) {
    if (err.message?.includes('retry_count') || err.message?.includes('doctor_clinic_name') ||
        err.message?.includes('doctor_division') || err.message?.includes('doctor_is_doctor')) {
      const safe = { ...data };
      delete safe.retry_count;
      delete safe.doctor_clinic_name;
      delete safe.doctor_division;
      delete safe.doctor_is_doctor;
      return await this.create(safe);
    }
    throw err;
  }
};

module.exports = MessageLog;
