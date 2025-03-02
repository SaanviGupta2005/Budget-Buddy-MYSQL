const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Expense = sequelize.define('Expense', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    amount: { type: DataTypes.FLOAT, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATE, allowNull: false }
});

module.exports = Expense;
