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

console.log("🚀 AI Music Player Backend v3.5.0");
console.log("🌍 Environment:", process.env.NODE_ENV || 'development');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.set('trust proxy', 1);

// ========== ENHANCED EMAIL SYSTEM (IMPROVED) ==========
class EmailSystem {
    constructor() {
        this.transporter = null;
        this.configured = false;
        this.mode = 'unknown';
        this.initialized = false;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
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
                rateLimit: 1,
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 10000
            });
            
            // Test the connection
            await this.transporter.verify();
            console.log('✅ Email transporter verified successfully');
            this.configured = true;
            this.mode = 'production';
            this.initialized = true;
            
        } catch (error) {
            console.error('❌ Email system initialization failed:', error.message);
            console.error('Error code:', error.code);
            
            if (error.code === 'EAUTH') {
                console.error('🔒 Authentication failed - Check your Gmail App Password');
                console.error('   → Go to https://myaccount.google.com/security');
                console.error('   → Enable 2-Step Verification');
                console.error('   → Generate new App Password');
            } else if (error.code === 'ETIMEDOUT') {
                console.error('⏱️ Connection timeout - Check network/firewall settings');
            }
            
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
                    otp: otp,
                    accepted: [options.to],
                    response: '250 Message accepted (simulated)'
                };
            },
            verify: async () => true
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
            
            // ✅ FIX: Check if this was a simulated send
            const wasSimulated = result.simulated === true;
            
            if (wasSimulated) {
                console.log('📧 OTP sent in SIMULATION mode');
                return {
                    success: true,
                    simulated: true,
                    otp: result.otp,
                    mode: this.mode,
                    messageId: result.messageId
                };
            }
            
            // ✅ FIX: Verify actual delivery for production
            const actuallyDelivered = 
                (result.accepted && result.accepted.length > 0) ||
                (result.response && result.response.includes('250'));
            
            if (actuallyDelivered) {
                console.log(`✅ OTP successfully delivered to ${email}`);
                this.consecutiveFailures = 0; // Reset on success
                
                return {
                    success: true,
                    simulated: false,
                    mode: this.mode,
                    messageId: result.messageId
                    // ❌ Never include OTP in production success response
                };
            } else {
                // Email "sent" but not accepted - treat as failure
                throw new Error('Email was not accepted by mail server');
            }
            
        } catch (error) {
            console.error('📧 Email sending error:', error.message);
            console.error('Error code:', error.code);
            
            this.consecutiveFailures++;
            
            // ✅ FIX: Log specific error types for debugging
            if (error.code === 'EAUTH') {
                console.error('🔒 AUTHENTICATION FAILED');
                console.error('   → Check EMAIL_USER and EMAIL_PASS in environment variables');
                console.error('   → Verify Gmail App Password is still valid');
                console.error('   → Ensure 2-Factor Authentication is enabled on Gmail');
            } else if (error.code === 'ETIMEDOUT') {
                console.error('⏱️ CONNECTION TIMEOUT');
                console.error('   → Check network connectivity');
                console.error('   → Verify firewall settings allow SMTP');
            } else if (error.code === 'ECONNREFUSED') {
                console.error('🚫 CONNECTION REFUSED');
                console.error('   → SMTP server may be down');
                console.error('   → Check if port 465/587 is accessible');
            } else if (error.responseCode === 550) {
                console.error('📮 MAILBOX NOT FOUND');
                console.error('   → Recipient email address may be invalid');
            } else if (error.responseCode === 554) {
                console.error('🚫 REJECTED');
                console.error('   → Email rejected by recipient server');
            }
            
            // Switch to fallback after too many failures
            if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                console.error(`🔄 Too many consecutive failures (${this.consecutiveFailures}), switching to simulation mode`);
                this.mode = 'fallback';
            }
            
            return {
                success: false,
                error: error.message,
                errorCode: error.code,
                responseCode: error.responseCode,
                mode: this.mode,
                // ❌ FIX: Never leak OTP on production errors
                // Only include debug info in non-production
                ...(process.env.NODE_ENV !== 'production' && {
                    debugInfo: {
                        stack: error.stack,
                        command: error.command
                    }
                })
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
                    .security-note { background: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 20px; color: #856404; font-size: 13px; }
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
                        <p class="note">⏰ This code will expire in <strong>10 minutes</strong>.</p>
                        <div class="security-note">
                            🔒 <strong>Security Notice:</strong> Never share this code with anyone. 
                            AI Music Player staff will never ask for your OTP.
                        </div>
                        <p style="margin-top: 20px; font-size: 13px; color: #999;">
                            If you didn't request this code, you can safely ignore this email.
                        </p>
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
            consecutiveFailures: this.consecutiveFailures,
            hasCredentials: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
            environment: process.env.NODE_ENV || 'development'
        };
    }
}

// Initialize email system
const emailSystem = new EmailSystem();
emailSystem.initialize().then(() => {
    console.log(`📧 Email system ready: ${emailSystem.mode} mode`);
}).catch(err => {
    console.error('📧 Email system initialization error:', err);
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
    otpAttempts: { type: Number, default: 0 },
    lastOtpRequest: Date,
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
        version: '3.5.0',
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

// Get recent test OTPs (for development/debugging)
app.get('/api/test-otps', async (req, res) => {
    try {
        // Only allow in development mode
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ 
                success: false, 
                message: 'Not available in production' 
            });
        }
        
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

// ✅ IMPROVED: Send OTP with better error handling
app.post('/auth/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Validate email format
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ 
                success: false,
                message: 'Email is required' 
            });
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ 
                success: false,
                message: 'Please enter a valid email address' 
            });
        }
        
        const normalizedEmail = email.trim().toLowerCase();
        
        // ✅ IMPROVED: Rate limiting check
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser && existingUser.lastOtpRequest) {
            const timeSinceLastRequest = Date.now() - existingUser.lastOtpRequest.getTime();
            const minDelay = 60000; // 1 minute
            
            if (timeSinceLastRequest < minDelay) {
                const remainingSeconds = Math.ceil((minDelay - timeSinceLastRequest) / 1000);
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${remainingSeconds} seconds before requesting another OTP`,
                    retryAfter: remainingSeconds
                });
            }
        }
        
        // Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        // Save OTP to database
        await User.findOneAndUpdate(
            { email: normalizedEmail },
            { 
                email: normalizedEmail,
                otp,
                otpExpires,
                otpAttempts: 0,
                lastOtpRequest: new Date(),
                lastLogin: new Date()
            },
            { upsert: true, new: true }
        );
        
        console.log(`📧 Attempting to send OTP to ${normalizedEmail}`);
        
        // ✅ IMPROVED: Send email and check result properly
        const emailResult = await emailSystem.sendOtpEmail(normalizedEmail, otp);
        
        console.log('📧 Email send result:', {
            success: emailResult.success,
            simulated: emailResult.simulated,
            mode: emailResult.mode,
            error: emailResult.error || 'none'
        });
        
        // ✅ IMPROVED: Handle three scenarios with proper responses
        
        // Scenario 1: Production success (email actually sent)
        if (emailResult.success && !emailResult.simulated) {
            return res.json({
                success: true,
                message: 'OTP sent to your email. Please check your inbox (and spam folder).',
                expiresIn: '10 minutes',
                mode: emailResult.mode
                // ❌ Never include OTP in production
            });
        }
        
        // Scenario 2: Simulation/Development mode (no real email)
        if (emailResult.success && emailResult.simulated) {
            return res.json({
                success: true,
                message: 'Email system in development mode. OTP shown in console.',
                expiresIn: '10 minutes',
                mode: emailResult.mode,
                otp: emailResult.otp, // ✅ Include OTP for development
                simulated: true,
                note: 'Configure EMAIL_USER and EMAIL_PASS for real email delivery'
            });
        }
        
        // Scenario 3: Email sending failed
        if (!emailResult.success) {
            console.error('❌ Email delivery failed:', emailResult.error);
            
            // Provide user-friendly error message
            let userMessage = 'Failed to send OTP email. ';
            let statusCode = 500;
            
            if (emailResult.errorCode === 'EAUTH') {
                userMessage += 'Email service authentication error. Please contact support.';
                statusCode = 503; // Service Unavailable
            } else if (emailResult.errorCode === 'ETIMEDOUT') {
                userMessage += 'Connection timeout. Please try again in a moment.';
                statusCode = 504; // Gateway Timeout
            } else if (emailResult.errorCode === 'ECONNREFUSED') {
                userMessage += 'Email service temporarily unavailable. Please try again later.';
                statusCode = 503;
            } else if (emailResult.responseCode === 550) {
                userMessage = 'Invalid email address. Please check and try again.';
                statusCode = 400; // Bad Request
            } else {
                userMessage += 'Please verify your email address and try again.';
            }
            
            return res.status(statusCode).json({
                success: false,
                message: userMessage,
                emailError: true,
                errorCode: emailResult.errorCode,
                mode: emailResult.mode,
                // ❌ Never leak OTP on errors
                // Include debug info only in development
                ...(process.env.NODE_ENV !== 'production' && {
                    debugError: emailResult.error,
                    debugInfo: emailResult.debugInfo
                })
            });
        }
        
        // Fallback (should never reach here)
        return res.status(500).json({
            success: false,
            message: 'Unexpected error sending OTP. Please try again.'
        });
        
    } catch (error) {
        console.error('❌ Send OTP endpoint error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.',
            ...(process.env.NODE_ENV !== 'production' && {
                debugError: error.message
            })
        });
    }
});

// ✅ IMPROVED: Verify OTP with attempt tracking
app.post('/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        // Validate input
        if (!email || !otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
            return res.status(400).json({ 
                success: false,
                message: 'Please enter a valid 6-digit OTP' 
            });
        }
        
        const normalizedEmail = email.trim().toLowerCase();
        
        // Find user with valid OTP
        const user = await User.findOne({ 
            email: normalizedEmail,
            otpExpires: { $gt: new Date() }
        });
        
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'No OTP found or OTP has expired. Please request a new one.' 
            });
        }
        
        // ✅ IMPROVED: Check attempt limit
        if (user.otpAttempts >= 5) {
            // Clear OTP after too many attempts
            user.otp = undefined;
            user.otpExpires = undefined;
            user.otpAttempts = 0;
            await user.save();
            
            return res.status(429).json({
                success: false,
                message: 'Too many incorrect attempts. Please request a new OTP.'
            });
        }
        
        // Verify OTP
        if (user.otp !== otp) {
            user.otpAttempts = (user.otpAttempts || 0) + 1;
            await user.save();
            
            const attemptsLeft = 5 - user.otpAttempts;
            
            return res.status(400).json({ 
                success: false,
                message: `Invalid OTP. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
                attemptsLeft
            });
        }
        
        // ✅ SUCCESS: Clear OTP and create session
        user.otp = undefined;
        user.otpExpires = undefined;
        user.otpAttempts = 0;
        user.lastLogin = new Date();
        await user.save();
        
        // Create session
        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.createdAt = Date.now();
        
        console.log(`✅ User logged in: ${user.email}`);
        
        res.json({
            success: true,
            message: 'Login successful!',
            user: { email: user.email }
        });
        
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error verifying OTP. Please try again.'
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
            // Return demo songs if user has no songs
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
        
        console.log(`📤 Uploading: ${title} by ${artist} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        
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
        
        console.log(`✅ Song uploaded: ${title}`);
        
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
        
        // Delete from Cloudinary
        if (song.cloudinaryId) {
            try {
                await cloudinary.uploader.destroy(song.cloudinaryId, { resource_type: 'video' });
                console.log(`🗑️ Deleted from Cloudinary: ${song.cloudinaryId}`);
            } catch (error) {
                console.error('Cloudinary delete error:', error);
            }
        }
        
        await Song.deleteOne({ _id: req.params.id });
        
        console.log(`✅ Song deleted: ${song.title}`);
        
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
    const userEmail = req.session.email;
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
        
        res.clearCookie('connect.sid');
        
        if (userEmail) {
            console.log(`👋 User logged out: ${userEmail}`);
        }
        
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
        ...(process.env.NODE_ENV !== 'production' && {
            error: err.message
        })
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AI MUSIC PLAYER BACKEND');
    console.log('='.repeat(60));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📧 Email Mode: ${emailSystem.mode}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
    console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Connected' : 'Not configured'}`);
    console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
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