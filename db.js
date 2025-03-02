const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('expense_tracker', 'root', 'Saanvigup0312#', {
    host: 'localhost',
    dialect: 'mysql'
});

sequelize.authenticate()
    .then(() => console.log('MySQL Database connected'))
    .catch(err => console.error('Error connecting to MySQL:', err));

module.exports = sequelize;
