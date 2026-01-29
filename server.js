require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const session = require('express-session');
const MongoStore = require('connect-mongo');

console.log("🚀 AI Music Player Backend v3.4.0");
console.log("🌍 Environment:", process.env.NODE_ENV || 'development');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.set('trust proxy', 1);

// ========== ENHANCED EMAIL SYSTEM ==========
class EmailSystem {
    constructor() {
        this.transporter = null;
        this.configured = false;
        this.mode = 'unknown';
        this.initialized = false;
    }

    async initialize() {
        console.log('📧 Initializing email system...');
        
        try {
            // Check for email credentials
            const hasEmailUser = process.env.EMAIL_USER && process.env.EMAIL_USER.trim() !== '';
            const hasEmailPass = process.env.EMAIL_PASS && process.env.EMAIL_PASS.trim() !== '';
            
            if (!hasEmailUser || !hasEmailPass) {
                console.log('⚠️ Email credentials not configured.');
                console.log('ℹ️ Set EMAIL_USER and EMAIL_PASS in Render environment variables');
                console.log('ℹ️ Using simulation mode - OTPs will be shown in logs and API responses');
                
                this.transporter = this.createSimulatedTransporter();
                this.configured = false;
                this.mode = 'simulation';
                this.initialized = true;
                return;
            }
            
            // Try to create real email transporter
            console.log('📧 Configuring Gmail SMTP transporter...');
            
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                pool: true,
                maxConnections: 1,
                rateDelta: 1000,
                rateLimit: 1
            });
            
            // Test the connection
            await this.transporter.verify();
            console.log('✅ Email transporter verified successfully');
            this.configured = true;
            this.mode = 'production';
            this.initialized = true;
            
        } catch (error) {
            console.error('❌ Email system initialization failed:', error.message);
            console.log('🔄 Falling back to simulation mode...');
            
            this.transporter = this.createSimulatedTransporter();
            this.configured = false;
            this.mode = 'fallback';
            this.initialized = true;
        }
    }

    createSimulatedTransporter() {
        return {
            sendMail: async (options) => {
                const otpMatch = options.html?.match(/\b(\d{6})\b/);
                const otp = otpMatch ? otpMatch[1] : 'NOT_FOUND';
                
                console.log('\n' + '='.repeat(60));
                console.log('📧 EMAIL SIMULATION');
                console.log('='.repeat(60));
                console.log(`To: ${options.to}`);
                console.log(`Subject: ${options.subject}`);
                console.log(`OTP Code: ${otp}`);
                console.log(`Mode: ${this.mode}`);
                console.log('='.repeat(60) + '\n');
                
                // Store OTP for easy testing
                await this.storeOtpForTesting(options.to, otp);
                
                return {
                    messageId: `simulated-${Date.now()}`,
                    simulated: true,
                    otp: otp
                };
            },
            verify: (callback) => callback(null, true)
        };
    }

    async storeOtpForTesting(email, otp) {
        try {
            // Create a test collection for OTP storage
            const testOtpSchema = new mongoose.Schema({
                email: String,
                otp: String,
                createdAt: { type: Date, default: Date.now, expires: 600 } // 10 minutes
            });
            
            // Use existing connection
            const TestOtp = mongoose.models.TestOtp || mongoose.model('TestOtp', testOtpSchema);
            
            await TestOtp.findOneAndUpdate(
                { email },
                { email, otp, createdAt: new Date() },
                { upsert: true }
            );
            
            console.log(`💾 Test OTP saved: ${email} -> ${otp}`);
        } catch (error) {
            console.error('Failed to save test OTP:', error.message);
        }
    }

    async sendOtpEmail(email, otp) {
        if (!this.initialized) {
            await this.initialize();
        }

        const mailOptions = {
            from: `"AI Music Player" <${process.env.EMAIL_USER || 'noreply@aimusicplayer.com'}>`,
            to: email,
            subject: 'Your OTP for AI Music Player',
            html: this.generateOtpEmailHtml(otp),
            text: `Your OTP code is: ${otp}. This code expires in 10 minutes.`
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            
            return {
                success: true,
                simulated: result.simulated || false,
                otp: result.otp || otp,
                mode: this.mode
            };
            
        } catch (error) {
            console.error('📧 Email sending error:', error.message);
            
            return {
                success: false,
                error: error.message,
                otp: otp, // Return OTP anyway for fallback
                mode: this.mode
            };
        }
    }

    generateOtpEmailHtml(otp) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Music Player OTP</title>
                <style>
                    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #7474bf, #348ac7); padding: 30px; text-align: center; color: white; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .content { padding: 30px; text-align: center; }
                    .otp-code { font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #333; margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; font-family: monospace; }
                    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e9ecef; }
                    .note { color: #666; font-size: 14px; margin-top: 20px; }
                    .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎵 AI Music Player</h1>
                        <p>Your Music, Anywhere</p>
                    </div>
                    <div class="content">
                        <h2>Verification Code</h2>
                        <p>Enter this code in the AI Music Player app to verify your email address:</p>
                        <div class="otp-code">${otp}</div>
                        <p class="note">This code will expire in 10 minutes.</p>
                        <p>If you didn't request this code, you can safely ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>© ${new Date().getFullYear()} AI Music Player. All rights reserved.</p>
                        <p>This is an automated email, please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    getStatus() {
        return {
            configured: this.configured,
            mode: this.mode,
            initialized: this.initialized,
            hasCredentials: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
            environment: process.env.NODE_ENV || 'development'
        };
    }
}

// Initialize email system
const emailSystem = new EmailSystem();
emailSystem.initialize().then(() => {
    console.log(`📧 Email system ready: ${emailSystem.mode} mode`);
});

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

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60,
        touchAfter: 24 * 3600
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    proxy: process.env.NODE_ENV === 'production'
}));

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

// Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    otp: String,
    otpExpires: Date,
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now }
});

const songSchema = new mongoose.Schema({
    title: String,
    artist: String,
    cloudinaryId: String,
    url: String,
    userEmail: String,
    duration: Number,
    size: Number,
    format: String,
    thumbnail: String,
    plays: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Song = mongoose.model('Song', songSchema);

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ 
            success: false,
            message: 'Please login to continue' 
        });
    }
    next();
};

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'audio/mpeg', 'audio/wav', 'audio/mp3', 
            'audio/mp4', 'audio/x-m4a', 'audio/ogg', 
            'audio/webm', 'audio/x-wav', 'audio/x-mpeg'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`));
        }
    }
});

// Cloudinary upload
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
                    console.error('Cloudinary error:', error);
                    reject(error);
                } else {
                    console.log('✅ Cloudinary upload:', result.public_id);
                    resolve(result);
                }
            }
        );
        
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};

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

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AI Music Player',
        version: '3.4.0',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1,
        cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
        email: emailSystem.getStatus(),
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
    });
});

// Email system status
app.get('/api/email-status', (req, res) => {
    res.json({
        success: true,
        ...emailSystem.getStatus()
    });
});

// Get recent test OTPs
app.get('/api/test-otps', async (req, res) => {
    try {
        const TestOtp = mongoose.models.TestOtp || mongoose.model('TestOtp', 
            new mongoose.Schema({
                email: String,
                otp: String,
                createdAt: { type: Date, default: Date.now, expires: 600 }
            })
        );
        
        const otps = await TestOtp.find().sort({ createdAt: -1 }).limit(10);
        res.json({ success: true, otps });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Send OTP
app.post('/auth/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ 
                success: false,
                message: 'Please enter a valid email address' 
            });
        }
        
        const normalizedEmail = email.toLowerCase();
        
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        // Save OTP to database
        await User.findOneAndUpdate(
            { email: normalizedEmail },
            { 
                email: normalizedEmail,
                otp,
                otpExpires,
                lastLogin: new Date()
            },
            { upsert: true, new: true }
        );
        
        // Send email
        const emailResult = await emailSystem.sendOtpEmail(normalizedEmail, otp);
        
        // Prepare response
        const response = {
            success: true,
            expiresIn: '10 minutes'
        };
        
        if (emailResult.success) {
            if (emailResult.simulated) {
                // Simulation mode
                response.message = `OTP generated: ${emailResult.otp}`;
                response.otp = emailResult.otp;
                response.mode = 'simulation';
                response.note = 'Email system is in simulation mode. Configure EMAIL_USER and EMAIL_PASS for real emails.';
            } else {
                // Real email sent
                response.message = 'OTP sent to your email! Check your inbox.';
                response.mode = 'production';
            }
        } else {
            // Email failed
            response.message = `OTP generated (email failed): ${emailResult.otp}`;
            response.otp = emailResult.otp;
            response.mode = 'fallback';
            response.note = 'Email sending failed. Using fallback mode.';
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('OTP Error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error processing your request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Verify OTP
app.post('/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        if (!email || !otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
            return res.status(400).json({ 
                success: false,
                message: 'Please enter a valid 6-digit OTP' 
            });
        }
        
        const user = await User.findOne({ 
            email: email.toLowerCase(),
            otp: otp,
            otpExpires: { $gt: new Date() }
        });
        
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid or expired OTP. Please request a new one.' 
            });
        }
        
        // Clear OTP
        user.otp = undefined;
        user.otpExpires = undefined;
        user.lastLogin = new Date();
        await user.save();
        
        // Create session
        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.createdAt = Date.now();
        
        res.json({
            success: true,
            message: 'Login successful!',
            user: { email: user.email }
        });
        
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error verifying OTP'
        });
    }
});

// Get current user
app.get('/auth/user', (req, res) => {
    if (req.session.email) {
        res.json({
            success: true,
            user: { email: req.session.email }
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Not authenticated'
        });
    }
});

// Get user's songs
app.get('/songs', requireAuth, async (req, res) => {
    try {
        const songs = await Song.find({ 
            userEmail: req.session.email 
        })
        .sort({ createdAt: -1 })
        .limit(100);
        
        if (songs.length === 0) {
            const demoMusic = [
                {
                    _id: 'demo1',
                    title: 'Ambient Dreams',
                    artist: 'AI Music Player',
                    url: 'https://res.cloudinary.com/dchyewou4/video/upload/v1691012341/ai-music-player/demo1.mp3',
                    thumbnail: 'https://res.cloudinary.com/dchyewou4/image/upload/v1691012341/ai-music-player/waveform1.jpg',
                    userEmail: req.session.email,
                    duration: 183,
                    size: 4200000,
                    format: 'mp3',
                    plays: 0,
                    createdAt: new Date()
                },
                {
                    _id: 'demo2',
                    title: 'Electronic Pulse',
                    artist: 'Demo Track',
                    url: 'https://res.cloudinary.com/dchyewou4/video/upload/v1691012342/ai-music-player/demo2.mp3',
                    thumbnail: 'https://res.cloudinary.com/dchyewou4/image/upload/v1691012342/ai-music-player/waveform2.jpg',
                    userEmail: req.session.email,
                    duration: 210,
                    size: 5100000,
                    format: 'mp3',
                    plays: 0,
                    createdAt: new Date()
                }
            ];
            return res.json(demoMusic);
        }
        
        res.json(songs);
        
    } catch (error) {
        console.error('Get songs error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading songs'
        });
    }
});

// Upload song
app.post('/upload', requireAuth, upload.single('audio'), async (req, res) => {
    try {
        const file = req.file;
        const title = req.body.title?.trim() || 'New Song';
        const artist = req.body.artist?.trim() || 'Unknown Artist';
        
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Please select an audio file'
            });
        }
        
        const uploadResult = await uploadToCloudinary(file.buffer, file.originalname);
        const thumbnail = generateThumbnail(uploadResult.public_id);
        
        const songData = {
            title,
            artist,
            cloudinaryId: uploadResult.public_id,
            url: uploadResult.secure_url,
            userEmail: req.session.email,
            duration: Math.round(uploadResult.duration || 0),
            size: uploadResult.bytes,
            format: uploadResult.format,
            thumbnail: thumbnail,
            plays: 0
        };
        
        const song = new Song(songData);
        await song.save();
        
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
                size: song.size
            }
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        
        let errorMessage = 'Upload failed';
        if (error.message.includes('File too large')) {
            errorMessage = 'File too large (max 100MB)';
        } else if (error.message.includes('Invalid file type')) {
            errorMessage = 'Invalid file type. Only audio files allowed.';
        } else if (error.message.includes('Cloudinary')) {
            errorMessage = 'Cloud storage error. Please try again.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
});

// Delete song
app.delete('/songs/:id', requireAuth, async (req, res) => {
    try {
        const song = await Song.findOne({
            _id: req.params.id,
            userEmail: req.session.email
        });
        
        if (!song) {
            return res.status(404).json({
                success: false,
                message: 'Song not found'
            });
        }
        
        if (song.cloudinaryId) {
            try {
                await cloudinary.uploader.destroy(song.cloudinaryId, { resource_type: 'video' });
            } catch (error) {
                console.error('Cloudinary delete error:', error);
            }
        }
        
        await Song.deleteOne({ _id: req.params.id });
        
        res.json({
            success: true,
            message: 'Song deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting song'
        });
    }
});

// Logout
app.post('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
        
        res.clearCookie('connect.sid');
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
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

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large (max 100MB)'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        message: 'Something went wrong!'
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📧 Email Mode: ${emailSystem.mode}`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Yes' : 'No'}`);
    console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});