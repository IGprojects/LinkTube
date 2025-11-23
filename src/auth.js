const CLIENT_ID = '4517f10f9b6946c1bc2547d1297a773f';
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = [
    'playlist-read-private',
    'playlist-modify-public',
    'playlist-modify-private'
];

// PKCE Helper Functions
function generateCodeVerifier(length) {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export async function authenticate() {
    const codeVerifier = generateCodeVerifier(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    return new Promise((resolve, reject) => {
        const authUrl = new URL('https://accounts.spotify.com/authorize');
        authUrl.searchParams.append('client_id', CLIENT_ID);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.append('scope', SCOPES.join(' '));
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('show_dialog', 'true'); // Force re-approval

        chrome.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive: true
        }, async (responseUrl) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            if (responseUrl) {
                const url = new URL(responseUrl);
                const error = url.searchParams.get('error');
                const code = url.searchParams.get('code');

                if (error) {
                    reject(new Error(`Spotify Auth Error: ${error}`));
                    return;
                }

                if (code) {
                    try {
                        // Exchange code for token
                        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: new URLSearchParams({
                                client_id: CLIENT_ID,
                                grant_type: 'authorization_code',
                                code: code,
                                redirect_uri: REDIRECT_URI,
                                code_verifier: codeVerifier,
                            }),
                        });

                        const tokenData = await tokenResponse.json();
                        if (tokenData.access_token) {
                            resolve(tokenData.access_token);
                        } else {
                            reject(new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`));
                        }
                    } catch (err) {
                        reject(new Error(`Token exchange error: ${err.message}`));
                    }
                } else {
                    reject(new Error('No code found in response'));
                }
            } else {
                reject(new Error('Auth flow failed'));
            }
        });
    });
}
