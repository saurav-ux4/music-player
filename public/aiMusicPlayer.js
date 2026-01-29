console.log("🎵 AI Music Player Frontend Loaded");

// ========== CONFIGURATION ==========
const BACKEND_URL = window.location.origin;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const HEALTH_TIMEOUT = 10000;

// ========== STATE MANAGEMENT ==========
const AppState = {
    // UI States
    currentScreen: 'loading', // 'loading', 'login', 'player'
    
    // Auth State
    auth: {
        isAuthenticated: false,
        email: null,
        sessionChecked: false
    },
    
    // Player State
    player: {
        audio: new Audio(),
        songs: [],
        currentSongIndex: -1,
        isPlaying: false,
        currentFile: null,
        volume: 0.8,
        shuffle: false,
        repeat: 'off', // 'off', 'one', 'all'
        isLoading: false
    },
    
    // System State
    system: {
        backendAvailable: false,
        retryCount: 0,
        initialized: false,
        lastHealthCheck: 0
    }
};

// ========== DOM ELEMENTS ==========
const elements = {
    // Screens
    loadingScreen: document.getElementById('loadingScreen'),
    loginScreen: document.getElementById('loginScreen'),
    mainApp: document.getElementById('mainApp'),
    loadingMessage: document.getElementById('loadingMessage'),
    backendStatus: document.getElementById('backendStatus'),
    
    // Login Elements
    emailInput: document.getElementById('emailInput'),
    otpInput: document.getElementById('otpInput'),
    sendOtpBtn: document.getElementById('sendOtpBtn'),
    verifyOtpBtn: document.getElementById('verifyOtpBtn'),
    resendOtpBtn: document.getElementById('resendOtpBtn'),
    loginMessage: document.getElementById('loginMessage'),
    emailStep: document.getElementById('emailStep'),
    otpStep: document.getElementById('otpStep'),
    backToEmailBtn: document.getElementById('backToEmailBtn'),
    
    // Player Elements
    currentTitle: document.getElementById('currentTitle'),
    currentArtist: document.getElementById('currentArtist'),
    albumArt: document.getElementById('albumArt'),
    progress: document.getElementById('progress'),
    progressContainer: document.getElementById('progressContainer'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    playBtn: document.getElementById('playBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    volumeBtn: document.getElementById('volumeBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    
    // Upload Elements
    uploadBtn: document.getElementById('uploadBtn'),
    fileInput: document.getElementById('fileInput'),
    uploadForm: document.getElementById('uploadForm'),
    confirmUpload: document.getElementById('confirmUpload'),
    cancelUpload: document.getElementById('cancelUpload'),
    uploadStatus: document.getElementById('uploadStatus'),
    songTitle: document.getElementById('songTitle'),
    songArtist: document.getElementById('songArtist'),
    
    // Playlist Elements
    songList: document.getElementById('songList'),
    userEmail: document.getElementById('userEmail'),
    logoutBtn: document.getElementById('logoutBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    searchInput: document.getElementById('searchInput'),
    songCount: document.getElementById('songCount'),
    
    // Status Elements
    playerStatus: document.getElementById('playerStatus'),
    statusText: document.getElementById('statusText')
};

// ========== INITIALIZATION ==========
class AppInitializer {
    static async initialize() {
        console.log("🚀 Starting AI Music Player initialization...");
        
        try {
            // Set initial UI state
            AppInitializer.setInitialUIState();
            
            // Setup event listeners
            setupEventListeners();
            
            // Setup player
            setupPlayer();
            
            // Start backend connection
            await AppInitializer.startBackendConnection();
            
        } catch (error) {
            console.error("Initialization failed:", error);
            AppInitializer.handleInitializationError(error);
        }
    }
    
    static setInitialUIState() {
        // Set loading screen as active
        elements.loadingScreen.classList.remove('hidden');
        elements.loginScreen.classList.remove('active');
        elements.mainApp.classList.remove('active');
        
        AppState.currentScreen = 'loading';
        updateLoadingMessage("Initializing application...");
    }
    
    static async startBackendConnection() {
        updateLoadingMessage("Connecting to music server...");
        updateBackendStatus("Checking backend health...");
        
        try {
            // Try to connect to backend with retries
            const isBackendAvailable = await AppInitializer.checkBackendHealthWithRetry();
            
            if (isBackendAvailable) {
                console.log("✅ Backend is available");
                AppState.system.backendAvailable = true;
                updateBackendStatus("Connected to server");
                
                // Check user session
                await checkSession();
            } else {
                console.log("⚠️ Backend not available, showing login screen");
                AppState.system.backendAvailable = false;
                updateBackendStatus("Server not responding - working offline");
                
                // Show login screen with warning
                setTimeout(() => {
                    showLogin();
                    showMessage('Backend server is starting up. Try again in 30 seconds.', 'info');
                }, 1000);
            }
            
        } catch (error) {
            console.error("Backend connection failed:", error);
            AppInitializer.handleBackendConnectionError();
        }
    }
    
    static async checkBackendHealthWithRetry() {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            updateLoadingMessage(`Checking server connection (attempt ${attempt}/${MAX_RETRIES})...`);
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
                
                const response = await fetch(`${BACKEND_URL}/health`, {
                    signal: controller.signal,
                    headers: { 'Cache-Control': 'no-cache' }
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log("Health check response:", data);
                    return true;
                }
                
            } catch (error) {
                console.log(`Attempt ${attempt} failed:`, error.name);
                
                if (attempt < MAX_RETRIES) {
                    updateLoadingMessage(`Retrying in ${RETRY_DELAY/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                }
            }
        }
        
        return false;
    }
    
    static handleBackendConnectionError() {
        updateLoadingMessage("Cannot connect to server");
        updateBackendStatus("Server connection failed");
        
        // Show login screen after delay
        setTimeout(() => {
            showLogin();
            showMessage('Cannot connect to server. Working in offline mode.', 'error');
        }, 1500);
    }
    
    static handleInitializationError(error) {
        console.error("Critical initialization error:", error);
        updateLoadingMessage("Initialization failed");
        
        // Emergency fallback - show login screen
        setTimeout(() => {
            elements.loadingScreen.classList.add('hidden');
            elements.loginScreen.classList.add('active');
            showMessage('Application initialization failed. Please refresh the page.', 'error');
        }, 2000);
    }
}

// ========== UI STATE MANAGEMENT ==========
function updateLoadingMessage(message) {
    if (elements.loadingMessage) {
        elements.loadingMessage.textContent = message;
    }
}

function updateBackendStatus(status) {
    if (elements.backendStatus) {
        elements.backendStatus.textContent = status;
    }
}

function showLogin() {
    console.log("🔓 Showing login screen");
    
    // Hide loading screen with transition
    elements.loadingScreen.classList.add('hidden');
    
    // Show login screen after transition
    setTimeout(() => {
        elements.loginScreen.classList.add('active');
        AppState.currentScreen = 'login';
        
        // Focus email input
        if (elements.emailInput) {
            setTimeout(() => elements.emailInput.focus(), 100);
        }
    }, 300);
}

function showPlayer() {
    console.log("🎮 Showing player screen");
    
    // Hide loading screen with transition
    elements.loadingScreen.classList.add('hidden');
    
    // Show player screen after transition
    setTimeout(() => {
        elements.mainApp.classList.add('active');
        AppState.currentScreen = 'player';
        
        // Load user songs if authenticated
        if (AppState.auth.isAuthenticated) {
            loadUserSongs();
            updateUserInfo();
        }
    }, 300);
}

function updateUserInfo() {
    if (elements.userEmail && AppState.auth.email) {
        elements.userEmail.textContent = `Logged in as: ${AppState.auth.email}`;
    }
}

// ========== AUTH FUNCTIONS ==========
async function checkSession() {
    if (!AppState.system.backendAvailable) {
        console.log("Backend not available, skipping session check");
        showLogin();
        return;
    }
    
    try {
        updateLoadingMessage("Checking user session...");
        
        const response = await fetch(`${BACKEND_URL}/auth/user`, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.user && data.user.email) {
                console.log("✅ User session found:", data.user.email);
                
                // Update auth state
                AppState.auth.isAuthenticated = true;
                AppState.auth.email = data.user.email;
                AppState.auth.sessionChecked = true;
                
                // Show player
                showPlayer();
                return;
            }
        }
        
        // No valid session
        console.log("No valid session found");
        AppState.auth.sessionChecked = true;
        showLogin();
        
    } catch (error) {
        console.error("Session check error:", error);
        AppState.auth.sessionChecked = true;
        showLogin();
        showMessage('Session check failed. Please login again.', 'error');
    }
}

async function sendOtp() {
    const email = elements.emailInput.value.trim().toLowerCase();
    
    if (!email || !email.includes('@')) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    showMessage('Sending OTP to your email...', '');
    elements.sendOtpBtn.disabled = true;
    elements.sendOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    try {
        const response = await fetch(`${BACKEND_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (!response.ok && !data.otp) {
            throw new Error(data.message || 'Failed to send OTP');
        }
        
        if (data.success || data.otp) {
            const message = data.otp ? 
                `OTP sent! Development OTP: ${data.otp}` : 
                'OTP sent to your email! Check your inbox.';
            
            showMessage(message, 'success');
            
            // Show OTP input
            elements.emailStep.style.display = 'none';
            elements.otpStep.style.display = 'block';
            setTimeout(() => elements.otpInput.focus(), 100);
            
        } else {
            throw new Error(data.message || 'Failed to send OTP');
        }
        
    } catch (error) {
        console.error("Send OTP error:", error);
        showMessage(error.message, 'error');
    } finally {
        elements.sendOtpBtn.disabled = false;
        elements.sendOtpBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP';
    }
}

async function verifyOtp() {
    const email = elements.emailInput.value.trim().toLowerCase();
    const otp = elements.otpInput.value.trim();
    
    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
        showMessage('Enter a valid 6-digit OTP', 'error');
        return;
    }
    
    showMessage('Verifying OTP...', '');
    elements.verifyOtpBtn.disabled = true;
    elements.verifyOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    
    try {
        const response = await fetch(`${BACKEND_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Invalid OTP');
        }
        
        // Update auth state
        AppState.auth.isAuthenticated = true;
        AppState.auth.email = email;
        
        showMessage('Login successful! Loading your music...', 'success');
        
        // Show player after delay
        setTimeout(() => {
            showPlayer();
        }, 1500);
        
    } catch (error) {
        console.error("Verify OTP error:", error);
        showMessage(error.message, 'error');
    } finally {
        elements.verifyOtpBtn.disabled = false;
        elements.verifyOtpBtn.innerHTML = '<i class="fas fa-check"></i> Verify & Enter';
    }
}

// ========== PLAYER FUNCTIONS ==========
function setupPlayer() {
    // Configure audio element
    AppState.player.audio.volume = AppState.player.volume;
    elements.volumeSlider.value = AppState.player.volume * 100;
    
    // Setup audio event listeners
    AppState.player.audio.addEventListener('timeupdate', updateProgress);
    AppState.player.audio.addEventListener('loadedmetadata', updateDuration);
    AppState.player.audio.addEventListener('ended', handleSongEnd);
    AppState.player.audio.addEventListener('error', handleAudioError);
    AppState.player.audio.addEventListener('canplay', () => {
        console.log("Audio can play");
        AppState.player.isLoading = false;
    });
    AppState.player.audio.addEventListener('waiting', () => {
        console.log("Audio waiting for data");
        AppState.player.isLoading = true;
    });
    
    updateShuffleButton();
    updateRepeatButton();
}

async function loadUserSongs() {
    if (!AppState.system.backendAvailable) {
        showMessageInPlayer('Server not available. Working offline.', 'error');
        return;
    }
    
    try {
        showMessageInPlayer('Loading your music...', 'info');
        
        const response = await fetch(`${BACKEND_URL}/songs`);
        if (!response.ok) throw new Error('Failed to load songs');
        
        const songs = await response.json();
        AppState.player.songs = songs;
        renderPlaylist();
        
        if (songs.length > 0) {
            // Select first song but don't auto-play
            AppState.player.currentSongIndex = 0;
            renderPlaylist();
            
            // Update display
            const firstSong = songs[0];
            elements.currentTitle.textContent = firstSong.title || 'Select a song to play';
            elements.currentArtist.textContent = firstSong.artist || 'Click any song in playlist';
            
            showMessageInPlayer(`${songs.length} songs loaded`, 'success');
        } else {
            showMessageInPlayer('No songs found. Upload some music!', 'info');
        }
    } catch (error) {
        console.error('Error loading songs:', error);
        showMessageInPlayer('Failed to load songs. Please refresh.', 'error');
        elements.songList.innerHTML = `
            <div class="playlist-item" style="text-align: center; color: #ff6b6b;">
                <i class="fas fa-exclamation-triangle"></i>
                Failed to load songs. Please try again.
            </div>
        `;
    }
}

function renderPlaylist() {
    elements.songList.innerHTML = '';
    
    if (AppState.player.songs.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'playlist-item';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = 'rgba(255,255,255,0.6)';
        emptyMessage.innerHTML = `
            <i class="fas fa-music" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
            <p>No songs yet</p>
            <p><small>Click "Upload Song" to add music</small></p>
        `;
        elements.songList.appendChild(emptyMessage);
        elements.songCount.textContent = '0 songs';
        return;
    }
    
    // Update song count
    elements.songCount.textContent = `${AppState.player.songs.length} ${AppState.player.songs.length === 1 ? 'song' : 'songs'}`;
    
    AppState.player.songs.forEach((song, index) => {
        const songElement = document.createElement('div');
        songElement.className = 'playlist-item';
        if (index === AppState.player.currentSongIndex) {
            songElement.classList.add('playing');
        }
        
        // Format file size and duration
        const fileSize = song.size ? formatFileSize(song.size) : 'Unknown size';
        const duration = song.duration ? formatTime(song.duration) : '--:--';
        
        songElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="flex: 1;">
                    <strong style="display: block; margin-bottom: 3px;">${song.title || 'Unknown Title'}</strong>
                    <small style="color: rgba(255,255,255,0.7);">
                        ${song.artist || 'Unknown Artist'} • ${duration} • ${fileSize}
                    </small>
                </div>
                <button class="delete-btn" data-id="${song._id}" 
                    style="background: rgba(255,107,107,0.2); border: none; color: #ff6b6b; cursor: pointer; 
                    width: 30px; height: 30px; border-radius: 50%; margin-left: 10px; display: flex; 
                    align-items: center; justify-content: center;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        songElement.addEventListener('click', () => playSong(index));
        
        // Add delete button listener
        const deleteBtn = songElement.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSong(song._id, song.title || 'this song');
        });
        
        elements.songList.appendChild(songElement);
    });
}

function playSong(index) {
    if (index < 0 || index >= AppState.player.songs.length) return;
    
    console.log(`🎵 Playing song ${index}`);
    
    AppState.player.currentSongIndex = index;
    const song = AppState.player.songs[index];
    
    // Update UI
    elements.currentTitle.textContent = song.title || 'Unknown Title';
    elements.currentArtist.textContent = song.artist || 'Unknown Artist';
    
    // Stop current playback if any
    AppState.player.audio.pause();
    AppState.player.audio.currentTime = 0;
    
    // Set new source
    AppState.player.audio.src = song.url;
    AppState.player.isLoading = true;
    
    // Update playlist highlighting
    renderPlaylist();
    
    // Try to play
    const playPromise = AppState.player.audio.play();
    
    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                console.log("✅ Playback started successfully");
                AppState.player.isPlaying = true;
                AppState.player.isLoading = false;
                elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                elements.playBtn.title = 'Pause';
            })
            .catch(error => {
                console.error("❌ Playback error:", error);
                
                if (error.name === 'AbortError') {
                    console.log("⚠️ Playback aborted (normal when skipping)");
                } else if (error.name === 'NotAllowedError') {
                    console.log("⛔ Autoplay not allowed");
                    showMessageInPlayer('Click the play button to start playback', 'info');
                } else {
                    showMessageInPlayer('Error playing this song', 'error');
                }
                
                AppState.player.isPlaying = false;
                AppState.player.isLoading = false;
                elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                elements.playBtn.title = 'Play';
            });
    }
}

function togglePlay() {
    // If no song is selected but we have songs, play the first one
    if (AppState.player.currentSongIndex === -1 && AppState.player.songs.length > 0) {
        playSong(0);
        return;
    }
    
    // If no songs exist at all
    if (AppState.player.songs.length === 0) {
        showMessageInPlayer('No songs to play. Upload one!', 'info');
        return;
    }
    
    if (AppState.player.isPlaying) {
        // Pause playback
        AppState.player.audio.pause();
        AppState.player.isPlaying = false;
        elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        elements.playBtn.title = 'Play';
    } else {
        // Start playback
        const playPromise = AppState.player.audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    AppState.player.isPlaying = true;
                    elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                    elements.playBtn.title = 'Pause';
                })
                .catch(error => {
                    console.error("Play error:", error);
                    AppState.player.isPlaying = false;
                    elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                });
        }
    }
}

function playPrevious() {
    if (AppState.player.songs.length === 0) return;
    
    let newIndex = AppState.player.currentSongIndex - 1;
    if (newIndex < 0) newIndex = AppState.player.songs.length - 1;
    
    playSong(newIndex);
}

function playNext() {
    if (AppState.player.songs.length === 0) return;
    
    let newIndex = AppState.player.currentSongIndex + 1;
    
    // Stop at the end of the playlist
    if (newIndex >= AppState.player.songs.length) {
        console.log("End of playlist reached");
        AppState.player.isPlaying = false;
        elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        return;
    }
    
    playSong(newIndex);
}

function handleSongEnd() {
    console.log("Song ended, repeat mode:", AppState.player.repeat);
    
    switch (AppState.player.repeat) {
        case 'one':
            // Play the same song again
            AppState.player.audio.currentTime = 0;
            AppState.player.audio.play();
            break;
        case 'all':
            // Play next song (loop to beginning if at end)
            let nextIndex = AppState.player.currentSongIndex + 1;
            if (nextIndex >= AppState.player.songs.length) {
                nextIndex = 0;
            }
            playSong(nextIndex);
            break;
        default:
            // 'off' - stop at end
            AppState.player.isPlaying = false;
            elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
            elements.playBtn.title = 'Play';
    }
}

function toggleShuffle() {
    AppState.player.shuffle = !AppState.player.shuffle;
    updateShuffleButton();
    
    if (AppState.player.shuffle) {
        // Shuffle the playlist
        const shuffled = [...AppState.player.songs];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        AppState.player.songs = shuffled;
        renderPlaylist();
        showMessageInPlayer('Shuffle enabled', 'success');
    } else {
        // Reload original order
        loadUserSongs();
        showMessageInPlayer('Shuffle disabled', 'info');
    }
}

function updateShuffleButton() {
    if (AppState.player.shuffle) {
        elements.shuffleBtn.innerHTML = '<i class="fas fa-random" style="color: #4CAF50;"></i>';
        elements.shuffleBtn.title = 'Shuffle On';
    } else {
        elements.shuffleBtn.innerHTML = '<i class="fas fa-random"></i>';
        elements.shuffleBtn.title = 'Shuffle Off';
    }
}

function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(AppState.player.repeat);
    AppState.player.repeat = modes[(currentIndex + 1) % modes.length];
    updateRepeatButton();
    
    const messages = {
        'off': 'Repeat Off',
        'all': 'Repeat All',
        'one': 'Repeat One'
    };
    showMessageInPlayer(messages[AppState.player.repeat], 'success');
}

function updateRepeatButton() {
    switch (AppState.player.repeat) {
        case 'off':
            elements.repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
            elements.repeatBtn.title = 'Repeat Off';
            break;
        case 'all':
            elements.repeatBtn.innerHTML = '<i class="fas fa-redo" style="color: #4CAF50;"></i>';
            elements.repeatBtn.title = 'Repeat All';
            break;
        case 'one':
            elements.repeatBtn.innerHTML = '<i class="fas fa-redo-alt" style="color: #4CAF50;"></i>';
            elements.repeatBtn.title = 'Repeat One';
            break;
    }
}

function updateProgress() {
    const { currentTime, duration } = AppState.player.audio;
    
    if (duration && !isNaN(duration)) {
        const progressPercent = (currentTime / duration) * 100;
        elements.progress.style.width = `${progressPercent}%`;
        elements.currentTime.textContent = formatTime(currentTime);
    }
}

function updateDuration() {
    const duration = AppState.player.audio.duration;
    if (duration && !isNaN(duration)) {
        elements.duration.textContent = formatTime(duration);
    }
}

function setProgress(e) {
    const width = e.currentTarget.clientWidth;
    const clickX = e.offsetX;
    const duration = AppState.player.audio.duration;
    
    if (duration && !isNaN(duration)) {
        AppState.player.audio.currentTime = (clickX / width) * duration;
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toggleMute() {
    AppState.player.audio.muted = !AppState.player.audio.muted;
    AppState.player.audio.volume = AppState.player.audio.muted ? 0 : AppState.player.volume;
    elements.volumeBtn.innerHTML = AppState.player.audio.muted ? 
        '<i class="fas fa-volume-mute"></i>' : 
        '<i class="fas fa-volume-up"></i>';
    elements.volumeBtn.title = AppState.player.audio.muted ? 'Unmute' : 'Mute';
    elements.volumeSlider.value = AppState.player.audio.muted ? 0 : AppState.player.volume * 100;
}

function updateVolume() {
    AppState.player.volume = elements.volumeSlider.value / 100;
    AppState.player.audio.volume = AppState.player.volume;
    AppState.player.audio.muted = AppState.player.volume === 0;
    elements.volumeBtn.innerHTML = AppState.player.volume === 0 ? 
        '<i class="fas fa-volume-mute"></i>' : 
        '<i class="fas fa-volume-up"></i>';
    elements.volumeBtn.title = AppState.player.volume === 0 ? 'Unmute' : 'Mute';
}

function handleAudioError() {
    console.error('Audio playback error:', AppState.player.audio.error);
    showMessageInPlayer('Error playing song. Try another song.', 'error');
}

// ========== UPLOAD FUNCTIONS ==========
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('audio/')) {
        showMessageInPlayer('Please select an audio file (MP3, WAV, etc.)', 'error');
        return;
    }
    
    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
        showMessageInPlayer('File too large (max 50MB)', 'error');
        return;
    }
    
    AppState.player.currentFile = file;
    elements.songTitle.value = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
    elements.songArtist.value = '';
    elements.uploadForm.style.display = 'block';
    elements.uploadStatus.style.display = 'none';
    elements.uploadStatus.innerHTML = '';
}

async function uploadSong() {
    if (!AppState.player.currentFile) return;
    
    const formData = new FormData();
    formData.append('audio', AppState.player.currentFile);
    formData.append('title', elements.songTitle.value.trim() || AppState.player.currentFile.name);
    formData.append('artist', elements.songArtist.value.trim() || 'Unknown Artist');
    
    elements.uploadStatus.style.display = 'block';
    elements.uploadStatus.innerHTML = `
        <div style="background: rgba(144, 238, 144, 0.2); padding: 10px; border-radius: 5px; text-align: center;">
            <i class="fas fa-spinner fa-spin"></i> Uploading to Cloudinary...
        </div>
    `;
    elements.confirmUpload.disabled = true;
    elements.confirmUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    try {
        const response = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Upload failed');
        }
        
        elements.uploadStatus.innerHTML = `
            <div style="background: rgba(144, 238, 144, 0.3); padding: 10px; border-radius: 5px; text-align: center;">
                <i class="fas fa-check-circle"></i> Upload successful!<br>
                <small>${data.song.title} uploaded to Cloudinary</small>
            </div>
        `;
        
        // Reset form
        cancelUploadForm();
        
        // Reload songs after delay
        setTimeout(() => {
            loadUserSongs();
        }, 2000);
        
    } catch (error) {
        console.error("Upload error:", error);
        elements.uploadStatus.innerHTML = `
            <div style="background: rgba(255, 107, 107, 0.3); padding: 10px; border-radius: 5px; text-align: center;">
                <i class="fas fa-exclamation-circle"></i> Upload failed<br>
                <small>${error.message}</small>
            </div>
        `;
    } finally {
        elements.confirmUpload.disabled = false;
        elements.confirmUpload.innerHTML = 'Confirm Upload';
    }
}

function cancelUploadForm() {
    elements.uploadForm.style.display = 'none';
    elements.uploadStatus.style.display = 'none';
    elements.uploadStatus.innerHTML = '';
    elements.fileInput.value = '';
    elements.songTitle.value = '';
    elements.songArtist.value = '';
    AppState.player.currentFile = null;
}

async function deleteSong(songId, songName) {
    if (!confirm(`Are you sure you want to delete "${songName}"? This action cannot be undone.`)) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/songs/${songId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to delete song');
        }
        
        // Remove from local state
        AppState.player.songs = AppState.player.songs.filter(song => song._id !== songId);
        
        // Update UI
        renderPlaylist();
        
        showMessageInPlayer(`"${songName}" deleted successfully`, 'success');
        
        // If current song was deleted, play next or stop
        if (AppState.player.currentSongIndex >= AppState.player.songs.length) {
            if (AppState.player.songs.length > 0) {
                playSong(0);
            } else {
                AppState.player.audio.pause();
                AppState.player.isPlaying = false;
                elements.currentTitle.textContent = 'No songs available';
                elements.currentArtist.textContent = 'Upload some music!';
                elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                elements.playBtn.title = 'Play';
            }
        }
        
    } catch (error) {
        console.error('Error deleting song:', error);
        showMessageInPlayer(`Failed to delete "${songName}"`, 'error');
    }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    // Login listeners
    if (elements.sendOtpBtn) {
        elements.sendOtpBtn.addEventListener('click', sendOtp);
    }
    
    if (elements.verifyOtpBtn) {
        elements.verifyOtpBtn.addEventListener('click', verifyOtp);
    }
    
    if (elements.resendOtpBtn) {
        elements.resendOtpBtn.addEventListener('click', sendOtp);
    }
    
    if (elements.backToEmailBtn) {
        elements.backToEmailBtn.addEventListener('click', () => {
            elements.emailStep.style.display = 'block';
            elements.otpStep.style.display = 'none';
        });
    }
    
    if (elements.emailInput) {
        elements.emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendOtp();
        });
    }
    
    if (elements.otpInput) {
        elements.otpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyOtp();
        });
    }
    
    // Player listeners
    if (elements.playBtn) {
        elements.playBtn.addEventListener('click', togglePlay);
    }
    
    if (elements.prevBtn) {
        elements.prevBtn.addEventListener('click', playPrevious);
    }
    
    if (elements.nextBtn) {
        elements.nextBtn.addEventListener('click', playNext);
    }
    
    if (elements.shuffleBtn) {
        elements.shuffleBtn.addEventListener('click', toggleShuffle);
    }
    
    if (elements.repeatBtn) {
        elements.repeatBtn.addEventListener('click', toggleRepeat);
    }
    
    if (elements.volumeBtn) {
        elements.volumeBtn.addEventListener('click', toggleMute);
    }
    
    if (elements.volumeSlider) {
        elements.volumeSlider.addEventListener('input', updateVolume);
    }
    
    // Progress bar listener
    if (elements.progressContainer) {
        elements.progressContainer.addEventListener('click', setProgress);
    }
    
    // Upload listeners
    if (elements.uploadBtn) {
        elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
    }
    
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (elements.confirmUpload) {
        elements.confirmUpload.addEventListener('click', uploadSong);
    }
    
    if (elements.cancelUpload) {
        elements.cancelUpload.addEventListener('click', cancelUploadForm);
    }
    
    // Logout and refresh listeners
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', logout);
    }
    
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', loadUserSongs);
    }
    
    // Search listener
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', filterSongs);
    }
}

// ========== UTILITY FUNCTIONS ==========
function filterSongs() {
    const searchTerm = elements.searchInput.value.toLowerCase().trim();
    const songItems = document.querySelectorAll('.playlist-item');
    
    songItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showMessage(text, type) {
    if (elements.loginMessage) {
        elements.loginMessage.textContent = text;
        elements.loginMessage.className = `login-message ${type}`;
    }
}

function showMessageInPlayer(text, type) {
    // Create a temporary message display
    const messageDiv = document.createElement('div');
    messageDiv.className = 'temp-message';
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        z-index: 1000;
        font-size: 14px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        backdrop-filter: blur(10px);
    `;
    
    let bgColor = 'rgba(33, 150, 243, 0.9)';
    let icon = '<i class="fas fa-info-circle"></i>';
    
    if (type === 'success') {
        bgColor = 'rgba(76, 175, 80, 0.9)';
        icon = '<i class="fas fa-check-circle"></i>';
    } else if (type === 'error') {
        bgColor = 'rgba(244, 67, 54, 0.9)';
        icon = '<i class="fas fa-exclamation-circle"></i>';
    } else if (type === 'warning') {
        bgColor = 'rgba(255, 152, 0, 0.9)';
        icon = '<i class="fas fa-exclamation-triangle"></i>';
    }
    
    messageDiv.style.background = bgColor;
    messageDiv.innerHTML = `${icon} ${text}`;
    
    // Remove existing message
    const existing = document.querySelector('.temp-message');
    if (existing) existing.remove();
    
    document.body.appendChild(messageDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (messageDiv.parentNode) messageDiv.remove();
            }, 300);
        }
    }, 3000);
}

async function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    
    try {
        await fetch(`${BACKEND_URL}/auth/logout`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Clear all state
    AppState.auth.isAuthenticated = false;
    AppState.auth.email = null;
    AppState.auth.sessionChecked = false;
    
    AppState.player.songs = [];
    AppState.player.currentSongIndex = -1;
    AppState.player.audio.pause();
    AppState.player.isPlaying = false;
    AppState.player.audio.src = '';
    AppState.player.shuffle = false;
    AppState.player.repeat = 'off';
    
    // Show login screen
    showLogin();
}

// ========== INITIALIZE APP ==========
// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .temp-message {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        z-index: 1000;
        font-size: 14px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        backdrop-filter: blur(10px);
    }
`;
document.head.appendChild(style);

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AppInitializer.initialize();
    });
} else {
    // DOM already loaded
    AppInitializer.initialize();
}

// Export for debugging
window.AppState = AppState;
window.AppInitializer = AppInitializer;