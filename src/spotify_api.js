export class SpotifyAPI {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://api.spotify.com/v1';
    }

    async _fetch(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers,
            cache: 'no-store'
        });
        if (!response.ok) {
            let errorBody;
            try {
                errorBody = await response.text();
                console.error("Spotify API Error Body:", errorBody);
            } catch (e) {
                console.error("Could not read error body", e);
            }
            throw new Error(`Spotify API Error: ${response.status} ${response.statusText} - ${errorBody || ''}`);
        }
        return response.json();
    }

    async getMe() {
        return this._fetch('/me');
    }

    async getUserPlaylists() {
        // TODO: Handle pagination if needed
        return this._fetch('/me/playlists?limit=50');
    }

    async searchTrack(query) {
        const params = new URLSearchParams({
            q: query,
            type: 'track',
            limit: 1
        });
        return this._fetch(`/search?${params.toString()}`);
    }

    async addTrackToPlaylist(playlistId, trackUri) {
        return this._fetch(`/playlists/${playlistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({
                uris: [trackUri]
            })
        });
    }
}
