const express = require('express');
const app = express();

// Custom Logger Middleware
const loggerMiddleware = (req, res, next) => {
  const method = req.method;
  const url = req.url;
  const time = new Date().toLocaleTimeString();

  console.log(method + ' ' + url + ' at ' + time);

  next(); // pass control to next middleware or route
};

// Apply middleware
app.use(loggerMiddleware);

// Sample route
app.get('/', (req, res) => {
  res.send('Middleware executed successfully');
});

// Start server
app.listen(3000);
