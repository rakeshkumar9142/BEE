const express = require('express');
const session = require('express-session');

const app = express();

app.use(express.json());

// Configure session middleware
app.use(
  session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true
  })
);

// Login route (create session)
app.post('/login', (req, res) => {
  const { username } = req.body;

  if (username) {
    req.session.user = username;
    res.send('Login successful');
  } else {
    res.send('Login failed');
  }
});

// Protected route
app.get('/dashboard', (req, res) => {
  if (req.session.user) {
    res.send('Welcome ' + req.session.user);
  } else {
    res.send('Please login first');
  }
});

// Logout route (destroy session)
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.send('Logged out');
});

app.listen(3000);
