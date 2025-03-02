const sequelize = require('./db');
const User = require('./models/user');
const Expense = require('./models/expense');

sequelize.sync({ force: true }).then(() => {
    console.log('Database synced.');
    process.exit();
}).catch(err => console.error('Sync error:', err));
