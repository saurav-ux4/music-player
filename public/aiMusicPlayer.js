console.log("🎵 AI Music Player Frontend v4.0.0 (No Auth)");

// ========== CONFIGURATION ==========
const BACKEND_URL = window.location.origin;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const HEALTH_TIMEOUT = 10000;

// ========== STATE MANAGEMENT ==========
const AppState = {
    // UI States
    currentScreen: 'loading', // 'loading', 'player'
    
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
    mainApp: document.getElementById('mainApp'),
    loadingMessage: document.getElementById('loadingMessage'),
    backendStatus: document.getElementById('backendStatus'),
    
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
        if (elements.loadingScreen) {
            elements.loadingScreen.classList.remove('hidden');
        }
        if (elements.mainApp) {
            elements.mainApp.classList.remove('active');
        }
        
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
                
                // Show player immediately (no auth required)
                showPlayer();
            } else {
                console.log("⚠️ Backend not available");
                AppState.system.backendAvailable = false;
                updateBackendStatus("Server not responding");
                
                // Show player anyway with offline message
                setTimeout(() => {
                    showPlayer();
                    showMessageInPlayer('Backend server is starting up. Songs may not load yet.', 'warning');
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
        
        // Show player anyway with error message
        setTimeout(() => {
            showPlayer();
            showMessageInPlayer('Cannot connect to server. Some features may not work.', 'error');
        }, 1500);
    }
    
    static handleInitializationError(error) {
        console.error("Critical initialization error:", error);
        updateLoadingMessage("Initialization failed");
        
        // Emergency fallback - show player
        setTimeout(() => {
            if (elements.loadingScreen) {
                elements.loadingScreen.classList.add('hidden');
            }
            if (elements.mainApp) {
                elements.mainApp.classList.add('active');
            }
            showMessageInPlayer('Application initialization failed. Please refresh the page.', 'error');
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

function showPlayer() {
    console.log("🎮 Showing player screen");
    
    // Hide loading screen
    if (elements.loadingScreen) {
        elements.loadingScreen.classList.add('hidden');
    }
    
    // Show player screen
    setTimeout(() => {
        if (elements.mainApp) {
            elements.mainApp.classList.add('active');
        }
        AppState.currentScreen = 'player';
        
        // Load songs
        loadUserSongs();
    }, 300);
}

// ========== PLAYER FUNCTIONS ==========
function setupPlayer() {
    // Configure audio element
    AppState.player.audio.volume = AppState.player.volume;
    if (elements.volumeSlider) {
        elements.volumeSlider.value = AppState.player.volume * 100;
    }
    
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
        showMessageInPlayer('Server not available. Cannot load songs.', 'error');
        return;
    }
    
    try {
        showMessageInPlayer('Loading music library...', 'info');
        
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
            if (elements.currentTitle) {
                elements.currentTitle.textContent = firstSong.title || 'Select a song to play';
            }
            if (elements.currentArtist) {
                elements.currentArtist.textContent = firstSong.artist || 'Click any song in playlist';
            }
            
            showMessageInPlayer(`${songs.length} song${songs.length !== 1 ? 's' : ''} loaded`, 'success');
        } else {
            showMessageInPlayer('No songs found. Upload some music!', 'info');
        }
    } catch (error) {
        console.error('Error loading songs:', error);
        showMessageInPlayer('Failed to load songs. Please refresh.', 'error');
        if (elements.songList) {
            elements.songList.innerHTML = `
                <div class="playlist-item" style="text-align: center; color: #ff6b6b;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Failed to load songs. Please try again.
                </div>
            `;
        }
    }
}

function renderPlaylist() {
    if (!elements.songList) return;
    
    elements.songList.innerHTML = '';
    
    if (AppState.player.songs.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'playlist-item';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = 'rgba(255,255,255,0.6)';
        emptyMessage.innerHTML = `
            <i class="fas fa-music" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
            <p>No songs yet</p>
            <p><small>Click "Upload to Cloud" to add music</small></p>
        `;
        elements.songList.appendChild(emptyMessage);
        if (elements.songCount) {
            elements.songCount.textContent = '0 songs';
        }
        return;
    }
    
    // Update song count
    if (elements.songCount) {
        elements.songCount.textContent = `${AppState.player.songs.length} ${AppState.player.songs.length === 1 ? 'song' : 'songs'}`;
    }
    
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
        
        songElement.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn')) {
                playSong(index);
            }
        });
        
        // Add delete button listener
        const deleteBtn = songElement.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSong(song._id, song.title || 'this song');
            });
        }
        
        elements.songList.appendChild(songElement);
    });
}

function playSong(index) {
    if (index < 0 || index >= AppState.player.songs.length) {
        console.error('Invalid song index:', index);
        return;
    }
    
    const song = AppState.player.songs[index];
    
    console.log(`▶️ Playing: ${song.title} by ${song.artist}`);
    
    // Update current index
    AppState.player.currentSongIndex = index;
    
    // Update audio source
    AppState.player.audio.src = song.url;
    
    // Update UI
    if (elements.currentTitle) {
        elements.currentTitle.textContent = song.title || 'Unknown Title';
    }
    if (elements.currentArtist) {
        elements.currentArtist.textContent = song.artist || 'Unknown Artist';
    }
    if (elements.albumArt && song.thumbnail) {
        elements.albumArt.src = song.thumbnail;
    }
    
    // Play audio
    AppState.player.audio.play().catch(error => {
        console.error('Error playing audio:', error);
        showMessageInPlayer('Failed to play song', 'error');
    });
    
    AppState.player.isPlaying = true;
    
    // Update play button
    if (elements.playBtn) {
        elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        elements.playBtn.title = 'Pause';
    }
    
    // Re-render playlist to update active song
    renderPlaylist();
    
    // Track play count (optional)
    trackPlayCount(song._id);
}

async function trackPlayCount(songId) {
    try {
        await fetch(`${BACKEND_URL}/songs/${songId}/play`, {
            method: 'POST'
        });
    } catch (error) {
        console.log('Failed to track play count:', error);
    }
}

function togglePlay() {
    if (AppState.player.songs.length === 0) {
        showMessageInPlayer('No songs available. Upload some music!', 'info');
        return;
    }
    
    if (AppState.player.isPlaying) {
        AppState.player.audio.pause();
        AppState.player.isPlaying = false;
        if (elements.playBtn) {
            elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
            elements.playBtn.title = 'Play';
        }
    } else {
        if (AppState.player.currentSongIndex === -1) {
            playSong(0);
        } else {
            AppState.player.audio.play();
            AppState.player.isPlaying = true;
            if (elements.playBtn) {
                elements.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                elements.playBtn.title = 'Pause';
            }
        }
    }
}

function playNext() {
    if (AppState.player.songs.length === 0) return;
    
    let nextIndex;
    
    if (AppState.player.shuffle) {
        nextIndex = Math.floor(Math.random() * AppState.player.songs.length);
    } else {
        nextIndex = (AppState.player.currentSongIndex + 1) % AppState.player.songs.length;
    }
    
    playSong(nextIndex);
}

function playPrevious() {
    if (AppState.player.songs.length === 0) return;
    
    let prevIndex = (AppState.player.currentSongIndex - 1 + AppState.player.songs.length) % AppState.player.songs.length;
    playSong(prevIndex);
}

function handleSongEnd() {
    console.log('Song ended');
    
    if (AppState.player.repeat === 'one') {
        // Replay current song
        AppState.player.audio.currentTime = 0;
        AppState.player.audio.play();
    } else if (AppState.player.repeat === 'all') {
        // Play next song
        playNext();
    } else {
        // Play next if not last, otherwise stop
        if (AppState.player.currentSongIndex < AppState.player.songs.length - 1) {
            playNext();
        } else {
            AppState.player.isPlaying = false;
            if (elements.playBtn) {
                elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                elements.playBtn.title = 'Play';
            }
        }
    }
}

function handleAudioError(error) {
    console.error('Audio error:', error);
    showMessageInPlayer('Error playing audio. File may be corrupted or unavailable.', 'error');
    
    AppState.player.isPlaying = false;
    if (elements.playBtn) {
        elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        elements.playBtn.title = 'Play';
    }
}

function toggleShuffle() {
    AppState.player.shuffle = !AppState.player.shuffle;
    updateShuffleButton();
    
    const status = AppState.player.shuffle ? 'enabled' : 'disabled';
    showMessageInPlayer(`Shuffle ${status}`, 'info');
}

function updateShuffleButton() {
    if (!elements.shuffleBtn) return;
    
    if (AppState.player.shuffle) {
        elements.shuffleBtn.style.color = '#4CAF50';
        elements.shuffleBtn.style.opacity = '1';
    } else {
        elements.shuffleBtn.style.color = '';
        elements.shuffleBtn.style.opacity = '0.6';
    }
}

function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(AppState.player.repeat);
    AppState.player.repeat = modes[(currentIndex + 1) % modes.length];
    
    updateRepeatButton();
    
    const messages = {
        'off': 'Repeat off',
        'all': 'Repeat all',
        'one': 'Repeat one'
    };
    showMessageInPlayer(messages[AppState.player.repeat], 'info');
}

function updateRepeatButton() {
    if (!elements.repeatBtn) return;
    
    if (AppState.player.repeat === 'off') {
        elements.repeatBtn.style.color = '';
        elements.repeatBtn.style.opacity = '0.6';
        elements.repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
    } else if (AppState.player.repeat === 'all') {
        elements.repeatBtn.style.color = '#4CAF50';
        elements.repeatBtn.style.opacity = '1';
        elements.repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
    } else {
        elements.repeatBtn.style.color = '#4CAF50';
        elements.repeatBtn.style.opacity = '1';
        elements.repeatBtn.innerHTML = '<i class="fas fa-redo"></i><span style="position: absolute; font-size: 8px; bottom: 2px; right: 2px;">1</span>';
    }
}

function updateVolume() {
    if (!elements.volumeSlider) return;
    
    const volume = elements.volumeSlider.value / 100;
    AppState.player.audio.volume = volume;
    AppState.player.volume = volume;
    
    // Update volume icon
    if (elements.volumeBtn) {
        if (volume === 0) {
            elements.volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (volume < 0.5) {
            elements.volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            elements.volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }
}

function toggleMute() {
    if (AppState.player.audio.volume === 0) {
        AppState.player.audio.volume = AppState.player.volume || 0.8;
        if (elements.volumeSlider) {
            elements.volumeSlider.value = (AppState.player.volume || 0.8) * 100;
        }
    } else {
        AppState.player.audio.volume = 0;
        if (elements.volumeSlider) {
            elements.volumeSlider.value = 0;
        }
    }
    updateVolume();
}

function updateProgress() {
    if (!elements.progress || !AppState.player.audio.duration) return;
    
    const percent = (AppState.player.audio.currentTime / AppState.player.audio.duration) * 100;
    elements.progress.style.width = `${percent}%`;
    
    if (elements.currentTime) {
        elements.currentTime.textContent = formatTime(AppState.player.audio.currentTime);
    }
}

function updateDuration() {
    if (!elements.duration) return;
    
    elements.duration.textContent = formatTime(AppState.player.audio.duration);
}

function setProgress(e) {
    if (!elements.progressContainer || !AppState.player.audio.duration) return;
    
    const rect = elements.progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    AppState.player.audio.currentTime = percent * AppState.player.audio.duration;
}

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========== UPLOAD FUNCTIONS ==========
function handleFileSelect(e) {
    const file = e.target.files[0];
    
    if (!file) return;
    
    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm'];
    
    if (!validTypes.includes(file.type)) {
        showMessageInPlayer('Invalid file type. Please select an audio file.', 'error');
        elements.fileInput.value = '';
        return;
    }
    
    // Validate file size (100MB max)
    if (file.size > 100 * 1024 * 1024) {
        showMessageInPlayer('File too large. Maximum size is 100MB.', 'error');
        elements.fileInput.value = '';
        return;
    }
    
    // Store file and show form
    AppState.player.currentFile = file;
    
    if (elements.uploadForm) {
        elements.uploadForm.style.display = 'block';
    }
    
    // Pre-fill with filename
    if (elements.songTitle) {
        elements.songTitle.value = file.name.replace(/\.[^/.]+$/, '');
    }
    if (elements.songArtist) {
        elements.songArtist.focus();
    }
}

async function uploadSong() {
    if (!AppState.player.currentFile) {
        showMessageInPlayer('Please select a file first', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('audio', AppState.player.currentFile);
    formData.append('title', elements.songTitle?.value.trim() || AppState.player.currentFile.name);
    formData.append('artist', elements.songArtist?.value.trim() || 'Unknown Artist');
    
    if (elements.uploadStatus) {
        elements.uploadStatus.style.display = 'block';
        elements.uploadStatus.innerHTML = `
            <div style="background: rgba(144, 238, 144, 0.2); padding: 10px; border-radius: 5px; text-align: center;">
                <i class="fas fa-spinner fa-spin"></i> Uploading to cloud storage...
            </div>
        `;
    }
    
    if (elements.confirmUpload) {
        elements.confirmUpload.disabled = true;
        elements.confirmUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Upload failed');
        }
        
        if (elements.uploadStatus) {
            elements.uploadStatus.innerHTML = `
                <div style="background: rgba(144, 238, 144, 0.3); padding: 10px; border-radius: 5px; text-align: center;">
                    <i class="fas fa-check-circle"></i> Upload successful!<br>
                    <small>${data.song.title} uploaded to cloud</small>
                </div>
            `;
        }
        
        showMessageInPlayer('Song uploaded successfully!', 'success');
        
        // Reset form
        cancelUploadForm();
        
        // Reload songs after delay
        setTimeout(() => {
            loadUserSongs();
        }, 2000);
        
    } catch (error) {
        console.error("Upload error:", error);
        
        if (elements.uploadStatus) {
            elements.uploadStatus.innerHTML = `
                <div style="background: rgba(255, 107, 107, 0.3); padding: 10px; border-radius: 5px; text-align: center;">
                    <i class="fas fa-exclamation-circle"></i> Upload failed<br>
                    <small>${error.message}</small>
                </div>
            `;
        }
        
        showMessageInPlayer('Upload failed: ' + error.message, 'error');
    } finally {
        if (elements.confirmUpload) {
            elements.confirmUpload.disabled = false;
            elements.confirmUpload.innerHTML = '<i class="fas fa-check"></i> Upload';
        }
    }
}

function cancelUploadForm() {
    if (elements.uploadForm) {
        elements.uploadForm.style.display = 'none';
    }
    if (elements.uploadStatus) {
        elements.uploadStatus.style.display = 'none';
        elements.uploadStatus.innerHTML = '';
    }
    if (elements.fileInput) {
        elements.fileInput.value = '';
    }
    if (elements.songTitle) {
        elements.songTitle.value = '';
    }
    if (elements.songArtist) {
        elements.songArtist.value = '';
    }
    AppState.player.currentFile = null;
}

async function deleteSong(songId, songName) {
    if (!confirm(`Are you sure you want to delete "${songName}"?\n\nThis action cannot be undone.`)) return;
    
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
                if (elements.currentTitle) {
                    elements.currentTitle.textContent = 'No songs available';
                }
                if (elements.currentArtist) {
                    elements.currentArtist.textContent = 'Upload some music!';
                }
                if (elements.playBtn) {
                    elements.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    elements.playBtn.title = 'Play';
                }
            }
        }
        
    } catch (error) {
        console.error('Error deleting song:', error);
        showMessageInPlayer(`Failed to delete "${songName}": ${error.message}`, 'error');
    }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
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
        elements.uploadBtn.addEventListener('click', () => {
            if (elements.fileInput) {
                elements.fileInput.click();
            }
        });
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
    
    // Refresh listener
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
    if (!elements.searchInput) return;
    
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
    
    .hidden {
        display: none !important;
    }
    
    .active {
        display: block !important;
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