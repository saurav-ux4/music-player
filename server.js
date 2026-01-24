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

console.log("🚀 AI Music Player Backend Starting...");
console.log("🌍 Environment:", process.env.NODE_ENV || 'development');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.set('trust proxy', 1); // Trust first proxy for Render

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('☁️ Cloudinary configured');

// Configure Nodemailer for production
let transporter;
if (process.env.NODE_ENV === 'production') {
  // Production email configuration
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
} else {
  // Development - log emails to console
  transporter = {
    sendMail: async (options) => {
      console.log('📧 DEV EMAIL:', options.to);
      console.log('📧 Subject:', options.subject);
      console.log('📧 OTP would be sent in production');
      return { messageId: 'dev-' + Date.now() };
    },
    verify: (callback) => callback(null, true)
  };
}

// CORS configuration for production
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, you can specify allowed origins
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

// Session configuration for cloud
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // 24 hours
    touchAfter: 24 * 3600 // 24 hours
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  proxy: process.env.NODE_ENV === 'production'
}));

// MongoDB Connection with retry logic
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

const connectWithRetry = async () => {
  console.log('🔗 Attempting MongoDB connection...');
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB Connected Successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('🔄 Retrying in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
});

// Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
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
      message: 'Unauthorized. Please login.' 
    });
  }
  next();
};

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for cloud
  },
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

// Generate thumbnail for audio (using Cloudinary's audio waveform)
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

// Upload to Cloudinary function
const uploadToCloudinary = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video', // Use 'video' for audio files in Cloudinary
        folder: 'ai-music-player',
        public_id: `song_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        overwrite: false,
        format: 'mp3',
        chunk_size: 6000000 // 6MB chunks for large files
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('Cloudinary upload successful:', result.public_id);
          resolve(result);
        }
      }
    );
    
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// ================== ROUTES ==================

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    service: 'AI Music Player',
    version: '3.3.0',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1,
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    email: !!process.env.EMAIL_USER,
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  };
  res.json(health);
});

// API Info
app.get('/api/info', (req, res) => {
  res.json({
    name: 'AI Music Player',
    version: '3.3.0',
    endpoints: {
      auth: ['/auth/send-otp', '/auth/verify-otp', '/auth/logout'],
      songs: ['/songs', '/songs/:id', '/upload'],
      health: '/health'
    },
    limits: {
      fileSize: '100MB',
      fileTypes: 'MP3, WAV, M4A, OGG, WEBM',
      sessionDuration: '24 hours'
    }
  });
});

// Send OTP
app.post('/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Valid email address required' 
      });
    }
    
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Save OTP to database
    await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { 
        email: email.toLowerCase(),
        otp,
        otpExpires,
        lastLogin: new Date()
      },
      { upsert: true, new: true }
    );
    
    // Prepare email
    const mailOptions = {
      from: `"AI Music Player" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP for AI Music Player',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">🎵 AI Music Player</h2>
          <div style="background: linear-gradient(135deg, #7474bf, #348ac7); padding: 30px; border-radius: 10px; text-align: center; color: white;">
            <h3 style="margin-top: 0;">Your Verification Code</h3>
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; margin: 20px 0;">
              ${otp}
            </div>
            <p>Enter this code in the app to verify your email.</p>
            <p style="font-size: 12px; opacity: 0.8;">This code expires in 10 minutes.</p>
          </div>
          <p style="text-align: center; color: #666; margin-top: 20px; font-size: 12px;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `
    };
    
    // Send email
    try {
      if (process.env.NODE_ENV === 'production') {
        await transporter.sendMail(mailOptions);
        console.log(`📧 OTP email sent to ${email}`);
      } else {
        console.log(`📧 DEV OTP for ${email}: ${otp}`);
      }
      
      res.json({
        success: true,
        message: process.env.NODE_ENV === 'production' 
          ? 'OTP sent to your email' 
          : `DEV OTP: ${otp}`,
        expiresIn: '10 minutes'
      });
      
    } catch (emailError) {
      console.error('Email error:', emailError);
      // In development, still return success with OTP
      res.json({
        success: true,
        message: `OTP (dev mode): ${otp}`,
        otp: otp,
        expiresIn: '10 minutes'
      });
    }
    
  } catch (error) {
    console.error('OTP Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error sending OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify OTP
app.post('/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp || otp.length !== 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and 6-digit OTP required' 
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
        message: 'Invalid or expired OTP' 
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
      user: {
        email: user.email
      }
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
      user: {
        email: req.session.email
      }
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
    
    // If no songs, return demo songs
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
      message: 'Error fetching songs'
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
        message: 'No audio file provided'
      });
    }
    
    console.log(`Uploading: ${title} by ${artist}, Size: ${file.size} bytes`);
    
    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(file.buffer, file.originalname);
    
    // Generate thumbnail
    const thumbnail = generateThumbnail(uploadResult.public_id);
    
    // Create song record
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
    
    console.log(`Song uploaded: ${song._id}`);
    
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
      errorMessage = 'Invalid file type. Please upload audio files only.';
    } else if (error.message.includes('Cloudinary')) {
      errorMessage = 'Cloud storage error. Please try again.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }
    }
    
    // Delete from database
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

// Increment play count
app.post('/songs/:id/play', requireAuth, async (req, res) => {
  try {
    await Song.updateOne(
      { _id: req.params.id, userEmail: req.session.email },
      { $inc: { plays: 1 } }
    );
    
    res.json({
      success: true,
      message: 'Play count updated'
    });
    
  } catch (error) {
    console.error('Play count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating play count'
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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Handle SPA routing - all other routes go to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  
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
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`📧 Email: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'Not configured'}`);
  console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});