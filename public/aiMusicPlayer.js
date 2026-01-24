console.log("🎵 AI Music Player Frontend Loaded");

// Configuration
const BACKEND_URL = window.location.origin;

// State
const authState = {
    isAuthenticated: false,
    email: null
};

// Player State
const playerState = {
    audio: new Audio(),
    songs: [],
    currentSongIndex: -1,
    isPlaying: false,
    currentFile: null,
    volume: 0.8
};

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const emailInput = document.getElementById('emailInput');
const otpInput = document.getElementById('otpInput');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const resendOtpBtn = document.getElementById('resendOtpBtn');
const loginMessage = document.getElementById('loginMessage');
const emailStep = document.getElementById('emailStep');
const otpStep = document.getElementById('otpStep');

// Player Elements
const currentTitle = document.getElementById('currentTitle');
const currentArtist = document.getElementById('currentArtist');
const albumArt = document.getElementById('albumArt');
const progress = document.getElementById('progress');
const progressContainer = document.getElementById('progressContainer');
const currentTime = document.getElementById('currentTime');
const duration = document.getElementById('duration');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const volumeBtn = document.getElementById('volumeBtn');
const volumeSlider = document.getElementById('volumeSlider');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const uploadForm = document.getElementById('uploadForm');
const confirmUpload = document.getElementById('confirmUpload');
const cancelUpload = document.getElementById('cancelUpload');
const uploadStatus = document.getElementById('uploadStatus');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const songList = document.getElementById('songList');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log("AI Music Player v3.2.0 Initializing...");
    checkSession();
    setupEventListeners();
    setupPlayer();
});

async function checkSession() {
    try {
        const response = await fetch(`${BACKEND_URL}/auth/user`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                authState.isAuthenticated = true;
                authState.email = data.email;
                showPlayer();
                loadUserSongs();
                updateUserInfo();
            } else {
                showLogin();
            }
        } else {
            showLogin();
        }
    } catch (error) {
        console.log("No active session");
        showLogin();
    }
}

function showLogin() {
    loginScreen.style.display = 'flex';
    mainApp.style.display = 'none';
    emailInput.value = '';
    otpInput.value = '';
    loginMessage.textContent = '';
    loginMessage.className = 'login-message';
    emailStep.style.display = 'block';
    otpStep.style.display = 'none';
}

function showPlayer() {
    loginScreen.style.display = 'none';
    mainApp.style.display = 'block';
}

function updateUserInfo() {
    userEmail.textContent = `Logged in as: ${authState.email}`;
}

function setupEventListeners() {
    // Login listeners
    sendOtpBtn.addEventListener('click', sendOtp);
    verifyOtpBtn.addEventListener('click', verifyOtp);
    resendOtpBtn.addEventListener('click', sendOtp);
    
    emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendOtp();
    });
    
    otpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyOtp();
    });
    
    // Player listeners
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);
    volumeBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', updateVolume);
    
    // Progress bar listener
    progressContainer.addEventListener('click', setProgress);
    
    // Upload listeners
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    confirmUpload.addEventListener('click', uploadSong);
    cancelUpload.addEventListener('click', cancelUploadForm);
    
    // Logout listener
    logoutBtn.addEventListener('click', logout);
    
    // Audio event listeners
    playerState.audio.addEventListener('timeupdate', updateProgress);
    playerState.audio.addEventListener('loadedmetadata', updateDuration);
    playerState.audio.addEventListener('ended', playNext);
    playerState.audio.addEventListener('error', handleAudioError);
}

function setupPlayer() {
    playerState.audio.volume = playerState.volume;
    volumeSlider.value = playerState.volume * 100;
}

async function sendOtp() {
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email || !email.includes('@')) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    showMessage('Sending OTP to your email...', '');
    sendOtpBtn.disabled = true;
    sendOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
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
        
        if (data.success) {
            showMessage('OTP sent to your email! Check your inbox.', 'success');
        } else if (data.otp) {
            // Development fallback
            showMessage(`OTP sent! Development OTP: ${data.otp}`, 'success');
        } else {
            throw new Error(data.message || 'Failed to send OTP');
        }
        
        // Show OTP input
        emailStep.style.display = 'none';
        otpStep.style.display = 'block';
        otpInput.focus();
        
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP';
    }
}

async function verifyOtp() {
    const email = emailInput.value.trim().toLowerCase();
    const otp = otpInput.value.trim();
    
    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
        showMessage('Enter a valid 6-digit OTP', 'error');
        return;
    }
    
    showMessage('Verifying OTP...', '');
    verifyOtpBtn.disabled = true;
    verifyOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    
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
        authState.isAuthenticated = true;
        authState.email = email;
        
        showMessage('Login successful! Loading your music...', 'success');
        
        setTimeout(() => {
            showPlayer();
            loadUserSongs();
            updateUserInfo();
        }, 1500);
        
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.innerHTML = '<i class="fas fa-check"></i> Verify & Enter';
    }
}

async function loadUserSongs() {
    try {
        showMessageInPlayer('Loading your music...', 'info');
        
        const response = await fetch(`${BACKEND_URL}/songs`);
        if (!response.ok) throw new Error('Failed to load songs');
        
        const songs = await response.json();
        playerState.songs = songs;
        renderPlaylist();
        
        if (songs.length > 0) {
            playSong(0);
            showMessageInPlayer(`${songs.length} songs loaded`, 'success');
        } else {
            showMessageInPlayer('No songs found. Upload some music!', 'info');
        }
    } catch (error) {
        console.error('Error loading songs:', error);
        showMessageInPlayer('Failed to load songs. Please refresh.', 'error');
        songList.innerHTML = '<div class="playlist-item" style="text-align: center; color: #ff6b6b;">Failed to load songs. Please try again.</div>';
    }
}

function renderPlaylist() {
    songList.innerHTML = '';
    
    if (playerState.songs.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'playlist-item';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = 'rgba(255,255,255,0.6)';
        emptyMessage.innerHTML = `
            <i class="fas fa-music" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
            <p>No songs yet</p>
            <p><small>Click "Upload Song" to add music</small></p>
        `;
        songList.appendChild(emptyMessage);
        return;
    }
    
    playerState.songs.forEach((song, index) => {
        const songElement = document.createElement('div');
        songElement.className = 'playlist-item';
        if (index === playerState.currentSongIndex) {
            songElement.classList.add('playing');
        }
        
        // Format file size
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
        
        songList.appendChild(songElement);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function playSong(index) {
    if (index < 0 || index >= playerState.songs.length) return;
    
    playerState.currentSongIndex = index;
    const song = playerState.songs[index];
    
    // Update UI
    currentTitle.textContent = song.title || 'Unknown Title';
    currentArtist.textContent = song.artist || 'Unknown Artist';
    
    // Set audio source
    playerState.audio.src = song.url;
    
    // Update playlist
    renderPlaylist();
    
    // Play the song
    playerState.audio.play()
        .then(() => {
            playerState.isPlaying = true;
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            playBtn.title = 'Pause';
        })
        .catch(error => {
            console.error('Playback error:', error);
            showMessageInPlayer('Error playing song. Please try another.', 'error');
        });
}

function togglePlay() {
    if (playerState.currentSongIndex === -1 && playerState.songs.length > 0) {
        playSong(0);
        return;
    }
    
    if (playerState.isPlaying) {
        playerState.audio.pause();
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.title = 'Play';
    } else {
        playerState.audio.play()
            .then(() => {
                playerState.isPlaying = true;
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                playBtn.title = 'Pause';
            })
            .catch(error => {
                console.error('Play error:', error);
                showMessageInPlayer('Cannot play this song format', 'error');
            });
    }
}

function playPrevious() {
    if (playerState.songs.length === 0) return;
    
    let newIndex = playerState.currentSongIndex - 1;
    if (newIndex < 0) newIndex = playerState.songs.length - 1;
    
    playSong(newIndex);
}

function playNext() {
    if (playerState.songs.length === 0) return;
    
    let newIndex = playerState.currentSongIndex + 1;
    if (newIndex >= playerState.songs.length) newIndex = 0;
    
    playSong(newIndex);
}

function updateProgress() {
    const { currentTime: audioCurrentTime, duration: audioDuration } = playerState.audio;
    
    if (audioDuration) {
        const progressPercent = (audioCurrentTime / audioDuration) * 100;
        progress.style.width = `${progressPercent}%`;
        
        // Update time display
        currentTime.textContent = formatTime(audioCurrentTime);
    }
}

function updateDuration() {
    duration.textContent = formatTime(playerState.audio.duration);
}

function setProgress(e) {
    const width = this.clientWidth;
    const clickX = e.offsetX;
    const duration = playerState.audio.duration;
    
    if (duration) {
        playerState.audio.currentTime = (clickX / width) * duration;
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toggleMute() {
    playerState.audio.muted = !playerState.audio.muted;
    playerState.audio.volume = playerState.audio.muted ? 0 : playerState.volume;
    volumeBtn.innerHTML = playerState.audio.muted ? 
        '<i class="fas fa-volume-mute"></i>' : 
        '<i class="fas fa-volume-up"></i>';
    volumeBtn.title = playerState.audio.muted ? 'Unmute' : 'Mute';
    volumeSlider.value = playerState.audio.muted ? 0 : playerState.volume * 100;
}

function updateVolume() {
    playerState.volume = volumeSlider.value / 100;
    playerState.audio.volume = playerState.volume;
    playerState.audio.muted = playerState.volume === 0;
    volumeBtn.innerHTML = playerState.volume === 0 ? 
        '<i class="fas fa-volume-mute"></i>' : 
        '<i class="fas fa-volume-up"></i>';
    volumeBtn.title = playerState.volume === 0 ? 'Unmute' : 'Mute';
}

function handleAudioError() {
    console.error('Audio playback error');
    if (playerState.songs.length > 0) {
        playNext();
        showMessageInPlayer('Error playing song. Skipping to next...', 'error');
    }
}

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
    
    playerState.currentFile = file;
    songTitle.value = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
    songArtist.value = '';
    uploadForm.style.display = 'block';
    uploadStatus.style.display = 'none';
    uploadStatus.innerHTML = '';
}

async function uploadSong() {
    if (!playerState.currentFile) return;
    
    const formData = new FormData();
    formData.append('audio', playerState.currentFile);
    formData.append('title', songTitle.value.trim() || playerState.currentFile.name);
    formData.append('artist', songArtist.value.trim() || 'Unknown Artist');
    
    uploadStatus.style.display = 'block';
    uploadStatus.innerHTML = `
        <div style="background: rgba(144, 238, 144, 0.2); padding: 10px; border-radius: 5px; text-align: center;">
            <i class="fas fa-spinner fa-spin"></i> Uploading to Cloudinary...
        </div>
    `;
    confirmUpload.disabled = true;
    confirmUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    try {
        const response = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Upload failed');
        }
        
        uploadStatus.innerHTML = `
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
        }, 1000);
        
    } catch (error) {
        uploadStatus.innerHTML = `
            <div style="background: rgba(255, 107, 107, 0.3); padding: 10px; border-radius: 5px; text-align: center;">
                <i class="fas fa-exclamation-circle"></i> Upload failed<br>
                <small>${error.message}</small>
            </div>
        `;
    } finally {
        confirmUpload.disabled = false;
        confirmUpload.innerHTML = 'Confirm Upload';
    }
}

function cancelUploadForm() {
    uploadForm.style.display = 'none';
    uploadStatus.style.display = 'none';
    uploadStatus.innerHTML = '';
    fileInput.value = '';
    songTitle.value = '';
    songArtist.value = '';
    playerState.currentFile = null;
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
        playerState.songs = playerState.songs.filter(song => song._id !== songId);
        
        // Update UI
        renderPlaylist();
        
        showMessageInPlayer(`"${songName}" deleted successfully`, 'success');
        
        // If current song was deleted, play next or stop
        if (playerState.currentSongIndex >= playerState.songs.length) {
            if (playerState.songs.length > 0) {
                playSong(0);
            } else {
                playerState.audio.pause();
                playerState.isPlaying = false;
                currentTitle.textContent = 'No songs available';
                currentArtist.textContent = 'Upload some music!';
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                playBtn.title = 'Play';
            }
        }
        
    } catch (error) {
        console.error('Error deleting song:', error);
        showMessageInPlayer(`Failed to delete "${songName}"`, 'error');
    }
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await fetch(`${BACKEND_URL}/auth/logout`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        // Clear local state
        authState.isAuthenticated = false;
        authState.email = null;
        playerState.songs = [];
        playerState.currentSongIndex = -1;
        playerState.audio.pause();
        playerState.isPlaying = false;
        playerState.audio.src = '';
        
        // Show login screen
        showLogin();
    }
}

function showMessage(text, type) {
    loginMessage.textContent = text;
    loginMessage.className = `login-message ${type}`;
}

function showMessageInPlayer(text, type) {
    // Create a temporary message display in the player
    const messageDiv = document.createElement('div');
    messageDiv.id = 'tempMessage';
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        border-radius: 5px;
        color: white;
        z-index: 1000;
        font-size: 14px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
    `;
    
    if (type === 'success') {
        messageDiv.style.background = 'rgba(76, 175, 80, 0.9)';
    } else if (type === 'error') {
        messageDiv.style.background = 'rgba(244, 67, 54, 0.9)';
    } else {
        messageDiv.style.background = 'rgba(33, 150, 243, 0.9)';
    }
    
    messageDiv.innerHTML = `
        ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : 
          type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : 
          '<i class="fas fa-info-circle"></i>'}
        ${text}
    `;
    
    // Remove existing message
    const existing = document.getElementById('tempMessage');
    if (existing) existing.remove();
    
    document.body.appendChild(messageDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (messageDiv.parentNode) messageDiv.remove();
            }, 300);
        }
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);