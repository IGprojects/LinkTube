import { authenticate } from './src/auth.js';
import { SpotifyAPI } from './src/spotify_api.js';

const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const loginBtn = document.getElementById('login-btn');
const songInput = document.getElementById('song-input');
const getTabBtn = document.getElementById('get-current-tab-btn');
const playlistSelect = document.getElementById('playlist-select');
const addBtn = document.getElementById('add-btn');
const statusMsg = document.getElementById('status-message');

let spotifyApi;

loginBtn.addEventListener('click', async () => {
    console.log("Login button clicked");
    try {
        const token = await authenticate();
        console.log("Authentication successful", token);
        spotifyApi = new SpotifyAPI(token);
        showMainSection();
        loadPlaylists();
    } catch (error) {
        console.error("Login error:", error);
        showStatus(`Login failed: ${error.message}`, 'error');
        alert(`Login failed: ${error.message}`); // Fallback for visibility
    }
});

getTabBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url.includes('youtube.com/watch')) {
        try {
            // We use message passing which is cleaner than executeScript for this
            const response = await chrome.tabs.sendMessage(tab.id, { action: "getTitle" });
            if (response && response.title) {
                songInput.value = response.title;
            } else {
                // Fallback if content script isn't ready or message fails
                // This might happen if the user installed the extension *after* opening the tab
                // In that case, we can try executeScript as a backup
                executeScriptFallback(tab.id);
            }
        } catch (error) {
            // Content script likely not loaded (e.g. tab opened before extension install)
            console.log("Message passing failed, trying fallback:", error);
            executeScriptFallback(tab.id);
        }
    } else {
        showStatus('Not a YouTube video tab', 'error');
    }
});

function executeScriptFallback(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: () => {
            const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer');
            return titleEl ? titleEl.innerText : document.title.replace(/ - YouTube$/, '');
        }
    }, (results) => {
        if (results && results[0]) {
            songInput.value = results[0].result;
        }
    });
}

addBtn.addEventListener('click', async () => {
    let rawQuery = songInput.value.trim();
    const playlistId = playlistSelect.value;

    if (!rawQuery || !playlistId) {
        showStatus('Please enter a song and select a playlist', 'error');
        return;
    }

    // 1. Handle YouTube URLs
    if (rawQuery.includes('youtube.com/') || rawQuery.includes('youtu.be/')) {
        try {
            showStatus('Fetching title from YouTube URL...', 'info');
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawQuery)}&format=json`;
            const response = await fetch(oembedUrl);
            if (response.ok) {
                const data = await response.json();
                rawQuery = data.title;
                showStatus(`Found: "${rawQuery}"`, 'success');
            } else {
                showStatus('Could not get title from URL. Try entering name manually.', 'error');
                return;
            }
        } catch (error) {
            console.error("oEmbed error:", error);
        }
    }

    // 2. Clean up the query
    // Remove common noise: (Official Video), [4K], ft. X, etc.
    let cleanQuery = rawQuery
        .replace(/(\(|\[)?(Official Video|Official Audio|Lyric Video|Music Video|MV|4K|HD|HQ)(\)|\])?/gi, '') // Added MV
        .replace(/['"]/g, '') // Remove quotes
        .replace(/(\(|\[)?(ft\.|feat\.|featuring)\s+[^)\]]+(\)|\])?/gi, '') // Remove features for broader search
        .replace(/\s*-\s*Topic\s*$/, '') // Remove " - Topic" suffix
        .trim();

    // 3. Try to detect "Artist - Title" pattern
    // Many YouTube videos are "Artist - Song Name"
    const separatorRegex = /\s*[-|:]\s*/;
    let finalQuery = cleanQuery;

    if (separatorRegex.test(cleanQuery)) {
        const parts = cleanQuery.split(separatorRegex);
        if (parts.length >= 2) {
            // Assume Part 1 is Artist, Part 2 is Track (or vice versa, but usually Artist first)
            const artist = parts[0].trim();
            const track = parts[1].trim();
            // Construct a more specific Spotify search query
            finalQuery = `track:${track} artist:${artist}`;
        }
    }

    try {
        showStatus(`Searching for: ${cleanQuery}...`, 'info');
        console.log("--- DEBUG START ---");
        console.log("Input Value:", songInput.value);
        console.log("Raw Query:", rawQuery);
        console.log("Clean Query:", cleanQuery);
        console.log("Final Query:", finalQuery);

        const searchResult = await spotifyApi.searchTrack(finalQuery);
        console.log("Search Result:", searchResult);

        if (searchResult.tracks.items.length > 0) {
            const track = searchResult.tracks.items[0];
            console.log("Track Found:", track.name, "by", track.artists[0].name);
            console.log("Track URI:", track.uri);

            await spotifyApi.addTrackToPlaylist(playlistId, track.uri);
            console.log("Track added successfully");

            showStatus(`Added "${track.name}" by ${track.artists[0].name}`, 'success');
            songInput.value = '';
        } else {
            // Fallback: If specific search failed, try loose search with just the cleaned string
            if (finalQuery !== cleanQuery) {
                console.log("Specific search failed, trying loose search...");
                const looseResult = await spotifyApi.searchTrack(cleanQuery);
                if (looseResult.tracks.items.length > 0) {
                    const track = looseResult.tracks.items[0];
                    console.log("Fallback Track Found:", track.name);

                    await spotifyApi.addTrackToPlaylist(playlistId, track.uri);
                    showStatus(`Added "${track.name}" by ${track.artists[0].name}`, 'success');
                    songInput.value = '';
                    return;
                }
            }
            console.log("No tracks found");
            showStatus('Song not found on Spotify', 'error');
        }
    } catch (error) {
        console.error("Search/Add Error:", error);
        showStatus(`Error: ${error.message}`, 'error');
    }
});

function showMainSection() {
    loginSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
}

async function loadPlaylists() {
    try {
        const [me, playlistsData] = await Promise.all([
            spotifyApi.getMe(),
            spotifyApi.getUserPlaylists()
        ]);

        playlistSelect.innerHTML = '<option value="" disabled selected>Select a playlist</option>';

        let writableCount = 0;
        playlistsData.items.forEach(playlist => {
            const isOwner = playlist.owner.id === me.id;
            const isCollaborative = playlist.collaborative;

            // Only show playlists we can edit
            if (isOwner || isCollaborative) {
                const option = document.createElement('option');
                option.value = playlist.id;
                option.textContent = playlist.name;
                playlistSelect.appendChild(option);
                writableCount++;
            }
        });

        if (writableCount === 0) {
            showStatus('No writable playlists found. Create one in Spotify!', 'error');
        }

    } catch (error) {
        console.error("Load playlists error:", error);
        showStatus('Failed to load playlists', 'error');
    }
}

function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = `status ${type}`;
    setTimeout(() => {
        statusMsg.textContent = '';
        statusMsg.className = 'status';
    }, 3000);
}
