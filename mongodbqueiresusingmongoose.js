const mongoose = require('mongoose');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/testdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Schema definition
const userSchema = new mongoose.Schema({
  name: String,
  email: String
});

// Model
const User = mongoose.model('User', userSchema);

// 1. INSERT document
User.create({
  name: 'Rakesh',
  email: 'rakesh@gmail.com'
});

// 2. FIND all documents
User.find().then(users => {
  console.log(users);
});

// 3. FIND document by ID
User.findById('64abc12345').then(user => {
  console.log(user);
});

// 4. UPDATE document
User.findByIdAndUpdate(
  '64abc12345',
  { name: 'Updated Name' }
);

// 5. DELETE document
User.findByIdAndDelete('64abc12345');
