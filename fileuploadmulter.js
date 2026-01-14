const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/filedb', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// File Schema
const fileSchema = new mongoose.Schema({
    originalName: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number, // in bytes
        required: true
    },
    uploadDate: {
        type: Date,
        default: Date.now
    },
    description: String
});

// File Model
const File = mongoose.model('File', fileSchema);

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-random-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// File Filter for Validation
const fileFilter = (req, file, cb) => {
    // Allowed MIME types
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and GIF images are allowed.'), false);
    }
};

// Multer Configuration with Limits
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit
        files: 5 // Maximum 5 files per request
    }
});

// Routes

// 1. Show upload form (HTML)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>File Upload</title>
            <style>
                body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input, textarea { width: 100%; padding: 8px; margin-bottom: 10px; }
                .error { color: red; margin: 10px 0; }
                .success { color: green; margin: 10px 0; }
                .file-list { margin-top: 20px; }
                .file-item { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
                img { max-width: 200px; max-height: 150px; }
                .file-info { font-size: 0.9em; color: #666; }
            </style>
        </head>
        <body>
            <h1>📁 File Upload with Validation</h1>
            
            ${req.query.error ? `<div class="error">⚠️ ${req.query.error}</div>` : ''}
            ${req.query.success ? `<div class="success">✅ ${req.query.success}</div>` : ''}
            
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label for="description">Description:</label>
                    <textarea id="description" name="description" rows="3"></textarea>
                </div>
                
                <div class="form-group">
                    <label for="files">Select Images (Max 5 files, 2MB each):</label>
                    <input type="file" id="files" name="files" multiple accept="image/*">
                    <small>Allowed: JPEG, PNG, GIF</small>
                </div>
                
                <button type="submit">Upload Files</button>
            </form>
            
            <hr>
            <h2>Uploaded Files</h2>
            <a href="/files">View All Files in JSON</a> | 
            <a href="/files/html">View All Files in HTML</a>
        </body>
        </html>
    `);
});

// 2. Handle file upload (Single or Multiple)
app.post('/upload', upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.redirect('/?error=No files selected');
        }

        const savedFiles = [];
        
        // Save each file info to MongoDB
        for (const file of req.files) {
            const fileData = new File({
                originalName: file.originalname,
                fileName: file.filename,
                filePath: `/uploads/${file.filename}`,
                mimeType: file.mimetype,
                size: file.size,
                description: req.body.description || ''
            });
            
            await fileData.save();
            savedFiles.push(fileData);
        }

        res.redirect(`/?success=${savedFiles.length} file(s) uploaded successfully`);
    } catch (error) {
        // Clean up uploaded files if MongoDB save fails
        if (req.files) {
            req.files.forEach(file => {
                const filePath = path.join(uploadsDir, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        res.redirect(`/?error=${encodeURIComponent(error.message)}`);
    }
});

// 3. Handle single file upload (alternative endpoint)
app.post('/upload/single', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file selected' });
        }

        const fileData = new File({
            originalName: req.file.originalname,
            fileName: req.file.filename,
            filePath: `/uploads/${req.file.filename}`,
            mimeType: req.file.mimetype,
            size: req.file.size,
            description: req.body.description || ''
        });

        await fileData.save();
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileData
        });
    } catch (error) {
        // Clean up file on error
        if (req.file) {
            const filePath = path.join(uploadsDir, req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        res.status(500).json({ error: error.message });
    }
});

// 4. Get all files (JSON)
app.get('/files', async (req, res) => {
    try {
        const files = await File.find().sort({ uploadDate: -1 });
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Get all files (HTML view)
app.get('/files/html', async (req, res) => {
    try {
        const files = await File.find().sort({ uploadDate: -1 });
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Uploaded Files</title>
            <style>
                body { font-family: Arial; margin: 20px; }
                .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
                .file-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
                img { max-width: 100%; height: auto; border-radius: 3px; }
                .file-info { font-size: 0.9em; color: #666; margin-top: 10px; }
                .file-actions { margin-top: 10px; }
                a { color: #007bff; text-decoration: none; }
                .back-link { margin-bottom: 20px; display: inline-block; }
            </style>
        </head>
        <body>
            <a href="/" class="back-link">← Back to Upload</a>
            <h1>📂 Uploaded Files (${files.length})</h1>
            <div class="file-grid">
        `;
        
        files.forEach(file => {
            const isImage = file.mimeType.startsWith('image/');
            const sizeKB = (file.size / 1024).toFixed(2);
            const uploadDate = new Date(file.uploadDate).toLocaleString();
            
            html += `
            <div class="file-card">
                <h3>${file.originalName}</h3>
                
                ${isImage ? `<img src="${file.filePath}" alt="${file.originalName}">` : ''}
                
                <div class="file-info">
                    <p><strong>Type:</strong> ${file.mimeType}</p>
                    <p><strong>Size:</strong> ${sizeKB} KB</p>
                    <p><strong>Uploaded:</strong> ${uploadDate}</p>
                    ${file.description ? `<p><strong>Description:</strong> ${file.description}</p>` : ''}
                    <p><strong>Storage Path:</strong> ${file.fileName}</p>
                </div>
                
                <div class="file-actions">
                    <a href="${file.filePath}" target="_blank">View File</a> | 
                    <a href="/download/${file._id}">Download</a> | 
                    <a href="/delete/${file._id}" onclick="return confirm('Delete this file?')" style="color: red;">Delete</a>
                </div>
            </div>
            `;
        });
        
        html += `
            </div>
            ${files.length === 0 ? '<p>No files uploaded yet.</p>' : ''}
        </body>
        </html>
        `;
        
        res.send(html);
    } catch (error) {
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

// 6. Download file by ID
app.get('/download/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const filePath = path.join(__dirname, uploadsDir, file.fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }
        
        res.download(filePath, file.originalName);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Delete file by ID
app.get('/delete/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.redirect('/?error=File not found');
        }
        
        const filePath = path.join(__dirname, uploadsDir, file.fileName);
        
        // Delete from filesystem
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        // Delete from MongoDB
        await File.findByIdAndDelete(req.params.id);
        
        res.redirect('/?success=File deleted successfully');
    } catch (error) {
        res.redirect(`/?error=${encodeURIComponent(error.message)}`);
    }
});

// 8. API: Get file by ID
app.get('/api/files/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.json(file);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. API: Delete file by ID
app.delete('/api/files/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const filePath = path.join(__dirname, uploadsDir, file.fileName);
        
        // Delete from filesystem
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        // Delete from MongoDB
        await File.findByIdAndDelete(req.params.id);
        
        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware for Multer errors
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size exceeds 2MB limit' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files (max 5)' });
        }
        return res.status(400).json({ error: err.message });
    }
    
    // Other errors
    res.status(500).json({ error: err.message });
});

// Start Server
app.listen(PORT, () => {
    console.log(`File upload server running on http://localhost:${PORT}`);
    console.log(`Upload directory: ${path.join(__dirname, uploadsDir)}`);
});