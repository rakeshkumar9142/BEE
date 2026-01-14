const express = require('express');
const app = express();

app.use(express.json());

// CREATE (POST)
app.post('/users', (req, res) => {
  res.send('User created');
});

// READ (GET)
app.get('/users/:id', (req, res) => {
  res.send('User fetched');
});

// UPDATE (PUT)
app.put('/users/:id', (req, res) => {
  res.send('User updated');
});

// DELETE (DELETE)
app.delete('/users/:id', (req, res) => {
  res.send('User deleted');
});

app.listen(3000);
