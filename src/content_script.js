// Content script to extract video title
function getVideoTitle() {
    // Try primary selector for YouTube video title
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
    if (titleElement) {
        return titleElement.innerText;
    }

    // Fallback to document title, cleaning up " - YouTube"
    return document.title.replace(/ - YouTube$/, '');
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getTitle") {
        const title = getVideoTitle();
        sendResponse({ title: title });
    }
});

