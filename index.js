const express = require('express');
const mongoose = require('mongoose');
const sequelize = require('./db');
const ejs = require('ejs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const Expense = require('./models/expense');
const User = require('./models/user');
const { Op } = require('sequelize');
const http = require('http'); 
const socketIo = require('socket.io'); 
const app = express();

const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))
app.set('view engine', 'ejs');


io.on('connection', (socket) => {
    console.log('A user connected');

    // Emit a welcome message on connection
    socket.emit('message', 'Welcome to the expense tracker!');

    // Listen for messages from the client
    socket.on('sendMessage', (msg) => {
        console.log('Message from client:', msg);
        io.emit('message', msg);  // Emit to all connected clients
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});
// Routes

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});


app.use(session({
    secret: 'saanvi',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 1-day session
}));

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    // Prevent caching for protected routes
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    next();
};


app.get('/home', requireAuth, async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }

    const { sortBy } = req.query;
    let order = [['date', 'DESC']]; // Default sorting

    switch (sortBy) {
        case 'date_asc':
            order = [['date', 'ASC']];
            break;
        case 'date_desc':
            order = [['date', 'DESC']];
            break;
        case 'amount_asc':
            order = [['amount', 'ASC']];
            break;
        case 'amount_desc':
            order = [['amount', 'DESC']];
            break;
    }

    try {
        const expenses = await Expense.findAll({ order });
        res.render('index', { expenses, sortBy });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/add', requireAuth, (req, res) => {
    res.render('add');
});

app.post('/add', async (req, res) => {
    const { amount, description, category, date } = req.body;

    try {
        await Expense.create({ amount, description, category, date });
        res.redirect('/home');
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/edit/:id', requireAuth, async (req, res) => {
    try {
        console.log("Fetching expense with ID:", req.params.id);
        const expense = await Expense.findByPk(req.params.id);
        if (!expense) {
            return res.status(404).send('Expense not found');
        }
        console.log("Expense fetched:", expense);
        res.render('edit', { expense });
    } catch (error) {
        console.error('Error fetching expense:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/edit/:id', async (req, res) => {
    const { amount, description, category, date } = req.body;

    try {
        const expense = await Expense.findByPk(req.params.id);
        if (!expense) {
            return res.status(404).send('Expense not found');
        }

        await expense.update({ amount, description, category, date });
        res.redirect('/home');
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/delete/:id', async (req, res) => {
    try {
        const expense = await Expense.findByPk(req.params.id);
        if (!expense) {
            return res.status(404).send('Expense not found');
        }

        await expense.destroy();
        res.redirect('/home');
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/calculator', requireAuth, (req, res) => {
    res.render('calculator');
});


app.get('/analysis', requireAuth, async (req, res) => {
    try {
        const expenses = await Expense.findAll();

        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Start of the week (assuming Sunday as the first day)
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());

        // Start of the month
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        let dailyTotal = 0;
        let weeklyTotal = 0;
        let monthlyTotal = 0;

        // Group by category and sum amounts
        const expenseSummary = expenses.reduce((acc, expense) => {
            const { category, amount, date } = expense;
            const expenseDate = new Date(date);

            // Daily total
            if (expenseDate >= today) {
                dailyTotal += amount;
            }

            // Weekly total
            if (expenseDate >= startOfWeek) {
                weeklyTotal += amount;
            }

            // Monthly total
            if (expenseDate >= startOfMonth) {
                monthlyTotal += amount;
            }

            // Group by category for the pie chart
            if (!acc[category]) {
                acc[category] = 0;
            }
            acc[category] += amount;
            return acc;
        }, {});

        const categories = Object.keys(expenseSummary);
        const totalAmounts = Object.values(expenseSummary);

        const monthlyTotals = Array(12).fill(0);
        expenses.forEach(expense => {
            const date = new Date(expense.date);
            const month = date.getMonth();
            monthlyTotals[month] += expense.amount;
        });

        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        res.render('analysis', {
            categories,
            totalAmounts,
            dailyTotal,
            weeklyTotal,
            monthlyTotal,
            monthNames,
            monthlyTotals
        });

    } catch (error) {
        console.error('Error fetching analysis:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/savings', requireAuth, async (req, res) => {
    try {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const startOfMonth = new Date(currentYear, currentMonth, 1);
        const startOfNextMonth = new Date(currentYear, currentMonth + 1, 1);

        const expenses = await Expense.findAll({
            where: {
                category: 'Entertainment',
                date: {
                    [Op.gte]: startOfMonth, // Start of the current month
                    [Op.lt]: startOfNextMonth // Start of the next month
                }
            }
        });

        // Calculate the total non-essential spending for the current month
        const totalNonEssential = expenses.reduce((total, expense) => total + expense.amount, 0);

        // Calculate 10% savings
        const tenPercentSavings = totalNonEssential * 0.1;

        // Calculate compound savings over 10 years with 5% interest compounded monthly
        const months = 10 * 12;
        const monthlyInterestRate = 0.05 / 12;
        const futureValue = tenPercentSavings * (Math.pow(1 + monthlyInterestRate, months) - 1) / monthlyInterestRate;

        res.render('savings', {
            totalNonEssential,
            tenPercentSavings: tenPercentSavings.toFixed(2),
            futureValue: futureValue.toFixed(2),
        });

    } catch (error) {
        console.error('Error fetching savings:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    const saltRounds = 10;

    try {
        const salt = await bcrypt.genSalt(saltRounds);
        const hash = await bcrypt.hash(password, salt);

        await User.create({ email, password: hash });
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.redirect('/register');
    }
});

app.get('/', (req, res) => {
    res.render('login');
});

app.post('/', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            req.session.user = { email: user.email };
            req.session.userId = user.id;

            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            res.redirect('/home');
        } else {
            res.render('login', { error: 'Invalid email or password' });
        }
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'An error occurred' });
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/home');
        }

        res.clearCookie('connect.sid'); // Clears session cookie
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.redirect('/');
    });
});



app.get('/download-pdf', requireAuth, async (req, res) => {
    const expenses = await Expense.findAll();

    // Sort expenses by date
    expenses.sort((a, b) => new Date(a.date) - new Date(b.date));

    const doc = new PDFDocument();

    res.setHeader('Content-disposition', 'attachment; filename=expenses.pdf');
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    // Title
    doc.fontSize(30).fillColor('blue').text('Expense Report', { underline: true, align: 'center' });
    doc.moveDown(0.5);

    // Subtitle
    doc.fontSize(14).fillColor('black').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1);

    // Table setup
    const tableTop = doc.y; // Track the Y position
    const tableLeft = 50;
    const tableWidth = 500;

    // Column headers
    doc.fontSize(12).fillColor('white').rect(tableLeft, tableTop, tableWidth, 30).fill(); // Header background
    doc.fillColor('white');
    doc.text('Date', tableLeft + 10, tableTop + 5);
    doc.text('Description', tableLeft + 150, tableTop + 5);
    doc.text('Amount', tableLeft + 400, tableTop + 5);

    // Draw a line for the header
    doc.moveTo(tableLeft, tableTop + 30).lineTo(tableLeft + tableWidth, tableTop + 30).stroke();

    let currentY = tableTop + 35;

    expenses.forEach(expense => {
        doc.fillColor('black').text(new Date(expense.date).toDateString(), tableLeft + 10, currentY);
        doc.text(expense.description, tableLeft + 150, currentY);
        doc.text(`Rs ${expense.amount.toFixed(2)}`, tableLeft + 400, currentY);
        currentY += 25;

        // Draw a line under each row
        doc.moveTo(tableLeft, currentY - 10).lineTo(tableLeft + tableWidth, currentY - 10).stroke();
    });

    // Final touches
    doc.moveTo(tableLeft, currentY - 10).lineTo(tableLeft + tableWidth, currentY - 10).stroke();
    doc.moveDown(1);

    // Summary section
    doc.fillColor('blue').fontSize(16).text('Total Expenses:', { continued: true });
    const totalExpenses = expenses.reduce((total, expense) => total + expense.amount, 0);
    doc.fillColor('red').text(`Rs ${totalExpenses.toFixed(2)}`);

    doc.end();
});

app.get('/currency-converter', requireAuth, (req, res) => {
    res.render('currency-converter', {
        fromCurrency: null,
        toCurrency: null,
        amount: null,
        convertedAmount: null,
        error: null
    });
});

app.post('/currency-converter', async (req, res) => {
    const { fromCurrency, toCurrency, amount } = req.body;
    const apiKey = '2a3bf2ed3b518f25d842ce6b';
    const apiUrl = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromCurrency}/${toCurrency}/${amount}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.result === 'success') {
            const convertedAmount = data.conversion_result.toFixed(2);
            res.render('currency-converter', { fromCurrency, toCurrency, amount, convertedAmount });
        } else {
            res.render('currency-converter', { fromCurrency, toCurrency, amount, convertedAmount: null });
        }
    } catch (error) {
        console.error(error);
        res.render('currency-converter', { fromCurrency, toCurrency, amount, convertedAmount: null });
    }
});

const preventBackScript = `
    (function() {
        window.history.pushState(null, "", window.location.href);
        window.onpopstate = function() {
            window.history.pushState(null, "", window.location.href);
        };
    })();
`;

// Add the script to all views by injecting it into EJS templates
app.use((req, res, next) => {
    res.locals.preventBackScript = preventBackScript;
    next();
});

app.listen(3000, () => {
    console.log(`Server listening on port 3000`);
});

