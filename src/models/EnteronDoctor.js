const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EnteronDoctor = sequelize.define('EnteronDoctor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  doctor_dp_code: { type: DataTypes.STRING, allowNull: true },
  doctor_name: { type: DataTypes.STRING, allowNull: false },
  contact: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: true },
  division: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'enteron_organogram_doctors',
  timestamps: false,
});

module.exports = EnteronDoctor;