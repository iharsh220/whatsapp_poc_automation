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
}, {
  tableName: 'message_logs',
  timestamps: true,
});

module.exports = MessageLog;
