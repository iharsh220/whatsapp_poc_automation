const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Doctor = sequelize.define('Doctor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  clinic_name: { type: DataTypes.STRING, allowNull: true },
  birthday: { type: DataTypes.DATEONLY, allowNull: true },
  anniversary: { type: DataTypes.DATEONLY, allowNull: true },
  clinic_anniversary: { type: DataTypes.DATEONLY, allowNull: true },
}, {
  tableName: 'doctors',
  timestamps: true,
});

module.exports = Doctor;
