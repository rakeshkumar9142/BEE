const express = require('express');
const app = express();

// Set EJS as view engine
app.set('view engine', 'ejs');

// Route to render data
app.get('/users', (req, res) => {
  const users = [
    { name: 'Rakesh', age: 21 },
    { name: 'Amit', age: 22 }
  ];

  res.render('users', { users });
});

// Start server
app.listen(3000);
