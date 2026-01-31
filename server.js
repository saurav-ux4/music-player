require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

console.log("🚀 AI Music Player Backend v4.0.0 (No Auth)");
console.log("🌍 Environment:", process.env.NODE_ENV || 'development');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.set('trust proxy', 1);

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('☁️ Cloudinary:', process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not configured');

// CORS configuration
const corsOptions = {
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        const allowedOrigins = [
            'https://ai-music-player.onrender.com',
            'http://localhost:3000',
            'http://localhost:5000'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('render.com')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined');
    process.exit(1);
}

const connectWithRetry = async () => {
    console.log('🔗 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ MongoDB error:', err.message);
        console.log('🔄 Retrying in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    }
};

connectWithRetry();

// Schemas - Simplified without user authentication
const songSchema = new mongoose.Schema({
    title: { type: String, required: true },
    artist: { type: String, default: 'Unknown Artist' },
    cloudinaryId: String,
    url: { type: String, required: true },
    duration: Number,
    size: Number,
    format: String,
    thumbnail: String,
    plays: { type: Number, default: 0 },
    uploadedBy: { type: String, default: 'Anonymous' }, // Optional: track who uploaded
    createdAt: { type: Date, default: Date.now }
});

const Song = mongoose.model('Song', songSchema);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'audio/mpeg', 'audio/wav', 'audio/mp3', 
            'audio/mp4', 'audio/x-m4a', 'audio/ogg', 
            'audio/webm', 'audio/x-wav', 'audio/x-mpeg'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`));
        }
    }
});

// Cloudinary upload helper
const uploadToCloudinary = (buffer, filename) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'video',
                folder: 'ai-music-player',
                public_id: `song_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                overwrite: false,
                format: 'mp3',
                chunk_size: 6000000
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else {
                    console.log('✅ Cloudinary upload successful:', result.public_id);
                    resolve(result);
                }
            }
        );
        
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};

// Generate thumbnail from audio file
const generateThumbnail = (publicId) => {
    return cloudinary.url(publicId, {
        resource_type: 'video',
        transformation: [
            { width: 300, height: 300, crop: 'fill' },
            { background: 'auto:predominant' },
            { effect: 'waveform:ff5500:1' }
        ]
    });
};

// ================== ROUTES ==================

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AI Music Player',
        version: '4.0.0',
        authenticationRequired: false,
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1,
        cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
    });
});

// Get all songs (PUBLIC - no auth required)
app.get('/songs', async (req, res) => {
    try {
        const songs = await Song.find()
            .sort({ createdAt: -1 })
            .limit(100);
        
        console.log(`📋 Retrieved ${songs.length} songs`);
        
        // If no songs exist, return demo songs
        if (songs.length === 0) {
            const demoMusic = [
                {
                    _id: 'demo1',
                    title: 'Ambient Dreams',
                    artist: 'AI Music Player',
                    url: 'https://res.cloudinary.com/dchyewou4/video/upload/v1691012341/ai-music-player/demo1.mp3',
                    thumbnail: 'https://res.cloudinary.com/dchyewou4/image/upload/v1691012341/ai-music-player/waveform1.jpg',
                    duration: 183,
                    size: 4200000,
                    format: 'mp3',
                    plays: 0,
                    uploadedBy: 'Demo',
                    createdAt: new Date()
                },
                {
                    _id: 'demo2',
                    title: 'Electronic Pulse',
                    artist: 'Demo Track',
                    url: 'https://res.cloudinary.com/dchyewou4/video/upload/v1691012342/ai-music-player/demo2.mp3',
                    thumbnail: 'https://res.cloudinary.com/dchyewou4/image/upload/v1691012342/ai-music-player/waveform2.jpg',
                    duration: 210,
                    size: 5100000,
                    format: 'mp3',
                    plays: 0,
                    uploadedBy: 'Demo',
                    createdAt: new Date()
                }
            ];
            return res.json(demoMusic);
        }
        
        res.json(songs);
        
    } catch (error) {
        console.error('❌ Get songs error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading songs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Upload song (PUBLIC - no auth required)
app.post('/upload', upload.single('audio'), async (req, res) => {
    try {
        const file = req.file;
        const title = req.body.title?.trim() || 'Untitled Song';
        const artist = req.body.artist?.trim() || 'Unknown Artist';
        const uploadedBy = req.body.uploadedBy?.trim() || 'Anonymous';
        
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Please select an audio file'
            });
        }
        
        console.log(`📤 Uploading: "${title}" by ${artist} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(file.buffer, file.originalname);
        const thumbnail = generateThumbnail(uploadResult.public_id);
        
        // Create song document
        const songData = {
            title,
            artist,
            cloudinaryId: uploadResult.public_id,
            url: uploadResult.secure_url,
            duration: Math.round(uploadResult.duration || 0),
            size: uploadResult.bytes,
            format: uploadResult.format,
            thumbnail: thumbnail,
            plays: 0,
            uploadedBy
        };
        
        const song = new Song(songData);
        await song.save();
        
        console.log(`✅ Song uploaded successfully: "${title}"`);
        
        res.json({
            success: true,
            message: 'Song uploaded successfully!',
            song: {
                _id: song._id,
                title: song.title,
                artist: song.artist,
                url: song.url,
                thumbnail: song.thumbnail,
                duration: song.duration,
                size: song.size,
                uploadedBy: song.uploadedBy,
                createdAt: song.createdAt
            }
        });
        
    } catch (error) {
        console.error('❌ Upload error:', error);
        
        let errorMessage = 'Upload failed';
        let statusCode = 500;
        
        if (error.message.includes('File too large')) {
            errorMessage = 'File too large (max 100MB)';
            statusCode = 400;
        } else if (error.message.includes('Invalid file type')) {
            errorMessage = 'Invalid file type. Only audio files allowed.';
            statusCode = 400;
        } else if (error.message.includes('Cloudinary')) {
            errorMessage = 'Cloud storage error. Please try again.';
            statusCode = 503;
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Delete song (PUBLIC - no auth required)
app.delete('/songs/:id', async (req, res) => {
    try {
        const songId = req.params.id;
        
        // Skip demo songs (they can't be deleted)
        if (songId.startsWith('demo')) {
            return res.status(400).json({
                success: false,
                message: 'Demo songs cannot be deleted'
            });
        }
        
        const song = await Song.findById(songId);
        
        if (!song) {
            return res.status(404).json({
                success: false,
                message: 'Song not found'
            });
        }
        
        // Delete from Cloudinary
        if (song.cloudinaryId) {
            try {
                await cloudinary.uploader.destroy(song.cloudinaryId, { resource_type: 'video' });
                console.log(`🗑️ Deleted from Cloudinary: ${song.cloudinaryId}`);
            } catch (error) {
                console.error('⚠️ Cloudinary delete error:', error.message);
                // Continue with database deletion even if Cloudinary fails
            }
        }
        
        // Delete from database
        await Song.deleteOne({ _id: songId });
        
        console.log(`✅ Song deleted: "${song.title}"`);
        
        res.json({
            success: true,
            message: 'Song deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting song',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update play count
app.post('/songs/:id/play', async (req, res) => {
    try {
        const songId = req.params.id;
        
        // Skip demo songs
        if (songId.startsWith('demo')) {
            return res.json({ success: true, plays: 0 });
        }
        
        const song = await Song.findByIdAndUpdate(
            songId,
            { $inc: { plays: 1 } },
            { new: true }
        );
        
        if (!song) {
            return res.status(404).json({
                success: false,
                message: 'Song not found'
            });
        }
        
        res.json({
            success: true,
            plays: song.plays
        });
        
    } catch (error) {
        console.error('❌ Play count error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating play count'
        });
    }
});

// Search songs
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query required'
            });
        }
        
        const songs = await Song.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { artist: { $regex: query, $options: 'i' } }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(50);
        
        console.log(`🔍 Search for "${query}" returned ${songs.length} results`);
        
        res.json({
            success: true,
            query: query,
            count: songs.length,
            songs: songs
        });
        
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching songs'
        });
    }
});

// Get statistics
app.get('/stats', async (req, res) => {
    try {
        const totalSongs = await Song.countDocuments();
        const totalPlays = await Song.aggregate([
            { $group: { _id: null, total: { $sum: '$plays' } } }
        ]);
        
        const topSongs = await Song.find()
            .sort({ plays: -1 })
            .limit(10)
            .select('title artist plays');
        
        res.json({
            success: true,
            stats: {
                totalSongs,
                totalPlays: totalPlays[0]?.total || 0,
                topSongs
            }
        });
        
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large (max 100MB)'
            });
        }
    }
    
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'CORS policy violation'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV !== 'production' ? err.message : undefined
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎵 AI MUSIC PLAYER - NO AUTHENTICATION');
    console.log('='.repeat(60));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔓 Authentication: DISABLED (Public access)`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
    console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Connected' : 'Not configured'}`);
    console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
    console.log('='.repeat(60));
    console.log('📋 Available Endpoints:');
    console.log('   GET    /songs          - Get all songs');
    console.log('   POST   /upload         - Upload new song');
    console.log('   DELETE /songs/:id      - Delete song');
    console.log('   POST   /songs/:id/play - Increment play count');
    console.log('   GET    /search?q=...   - Search songs');
    console.log('   GET    /stats          - Get statistics');
    console.log('   GET    /health         - Health check');
    console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    server.close(() => {
        console.log('🔌 HTTP server closed');
        
        mongoose.connection.close(false, () => {
            console.log('🗄️ MongoDB connection closed');
            console.log('👋 Server shut down complete');
            process.exit(0);
        });
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);