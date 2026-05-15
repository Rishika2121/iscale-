const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'iscale_secret_key'; // In production, use environment variable

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for data
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const readData = (file) => {
  const filePath = path.join(DATA_DIR, `${file}.json`);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const writeData = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, `${file}.json`), JSON.stringify(data, null, 2));
};

// --- Auth APIs ---

// Register (Matching index.html path: /api/v1/auth/register)
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { first_name, last_name, email, password, contact, gender } = req.body;
    const users = readData('users');

    if (users.find(u => u.email === email)) {
      return res.status(400).json({ status: 'error', message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now(),
      first_name,
      last_name,
      email,
      password: hashedPassword,
      contact,
      gender,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeData('users', users);

    res.status(201).json({ status: 'success', message: 'User registered successfully', userId: newUser.id });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error registering user', error: error.message });
  }
});

// Login (Matching index.html path: /api/v1/auth/login)
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readData('users');
    const user = users.find(u => u.email === email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ status: 'success', message: 'Login successful', token, user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error logging in', error: error.message });
  }
});

// Middleware to verify JWT
const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ status: 'error', message: 'No token provided' });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ status: 'error', message: 'Failed to authenticate token' });
    req.userId = decoded.userId;
    next();
  });
};

// --- Expense & Tax APIs (As per the long image table) ---

app.get('/api/v1/expenses', authenticate, (req, res) => {
  const expenses = readData('expenses');
  const userExpenses = expenses.filter(e => e.userId === req.userId);
  res.json({ status: 'success', data: userExpenses });
});

app.post('/api/v1/expenses', authenticate, (req, res) => {
  const { title, amount, date, category, description } = req.body;
  const expenses = readData('expenses');
  const newExpense = {
    id: Date.now(),
    userId: req.userId,
    title,
    amount,
    date,
    category,
    description,
    createdAt: new Date().toISOString()
  };
  expenses.push(newExpense);
  writeData('expenses', expenses);
  res.status(201).json({ status: 'success', data: newExpense });
});

app.get('/api/v1/taxes', authenticate, (req, res) => {
  const taxes = readData('taxes');
  const userTaxes = taxes.filter(t => t.userId === req.userId);
  res.json({ status: 'success', data: userTaxes });
});

app.post('/api/v1/taxes', authenticate, (req, res) => {
  const { title, amount, date, category, description } = req.body;
  const taxes = readData('taxes');
  const newTax = {
    id: Date.now(),
    userId: req.userId,
    title,
    amount,
    date,
    category,
    description,
    createdAt: new Date().toISOString()
  };
  taxes.push(newTax);
  writeData('taxes', taxes);
  res.status(201).json({ status: 'success', data: newTax });
});

// --- Form APIs (Matching index.html) ---

app.post('/api/v1/user/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  const contacts = readData('contact');
  contacts.push({ id: Date.now(), name, email, phone, subject, message, date: new Date().toISOString() });
  writeData('contact', contacts);
  res.json({ status: 'success', message: 'Thank you for contacting us! We will get back to you soon.' });
});

app.post('/api/v1/user/hire', (req, res) => {
  const { company_name, contact_person, email, phone, message } = req.body;
  const hires = readData('hire');
  hires.push({ id: Date.now(), company_name, contact_person, email, phone, message, date: new Date().toISOString() });
  writeData('hire', hires);
  res.json({ status: 'success', message: 'Thank you for your interest! Our team will contact you shortly.' });
});

// Mock category courses for the frontend AJAX calls
app.post('/get_category_course', (req, res) => {
    const { cat_id } = req.body;
    // Return some mock HTML for the category courses as requested by index.html's AJAX
    res.send(`
        <div class="rbt-vertical-inner tab-content" style="display: block">
            <div class="rbt-vertical-single">
                <div class="row">
                    <div class="col-lg-12 col-sm-12 col-12">
                        <div class="vartical-nav-content-menu">
                            <ul class="rbt-vertical-nav-list-wrapper">
                                <li><a href="#">Course for Category ${cat_id} - Link 1</a></li>
                                <li><a href="#">Course for Category ${cat_id} - Link 2</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
});

// Handle SPA routing - return index.html for unknown routes
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 The iScale API server is running!`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
