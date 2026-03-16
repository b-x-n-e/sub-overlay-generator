document.addEventListener('DOMContentLoaded', () => {
    const channelInput = document.getElementById('channel');
    const mediaInput = document.getElementById('media');
    const durationInput = document.getElementById('duration');
    const textTemplateInput = document.getElementById('text-template');
    
    const fileNameSpan = document.getElementById('file-name');
    const dropArea = document.getElementById('drop-area');
    const generateBtn = document.getElementById('generate-btn');
    const testBtn = document.getElementById('test-btn');
    
    const previewModal = document.getElementById('preview-modal');
    const closePreviewBtn = document.getElementById('close-preview');
    const alertBox = document.getElementById('alert-box');
    const mediaContainer = document.getElementById('media-container');
    const alertText = document.getElementById('alert-text');

    let currentMediaDataUrl = null;
    let currentMediaType = null;

    // File Input Logic
    mediaInput.addEventListener('change', handleFile);
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
    });

    dropArea.addEventListener('drop', (e) => {
        if(e.dataTransfer.files.length > 0) {
            mediaInput.files = e.dataTransfer.files;
            handleFile({ target: mediaInput });
        }
    });

    function handleFile(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileNameSpan.textContent = file.name.toUpperCase();
            currentMediaType = file.type.startsWith('video') ? 'video' : 'image';
            
            const reader = new FileReader();
            reader.onload = (event) => {
                currentMediaDataUrl = event.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            fileNameSpan.textContent = "DROP FILE OR CLICK (GIF/MP4)";
            currentMediaDataUrl = null;
        }
    }

    // Generator Logic
    generateBtn.addEventListener('click', () => {
        const channel = channelInput.value.trim().toLowerCase();
        const duration = parseInt(durationInput.value) || 5;
        const textTemplate = textTemplateInput.value;

        if (!channel) {
            alert('PLEASE ENTER A CHANNEL NAME');
            return;
        }
        if (!currentMediaDataUrl) {
            alert('PLEASE UPLOAD A MEDIA FILE');
            return;
        }

        generateOverlayFile(channel, duration, textTemplate, currentMediaDataUrl, currentMediaType);
    });

    function generateOverlayFile(channel, duration, template, mediaData, mediaType) {
        // Build the HTML content as a string
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>OBS Sub Overlay - ${channel}</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/tmi.js/1.8.5/tmi.min.js"><\/script>
    <style>
        :root { --font: 'Space Grotesk', sans-serif; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            background: transparent; 
            overflow: hidden; 
            font-family: var(--font);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .hidden { display: none !important; }
        #alert-box {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem;
        }
        #media-container img, #media-container video {
            max-width: 800px;
            max-height: 500px;
            border-radius: 4px;
        }
        @keyframes popIn {
            0% { transform: scale(0.95); opacity: 0; filter: blur(10px); }
            100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes popOut {
            0% { transform: scale(1); opacity: 1; filter: blur(0); }
            100% { transform: scale(0.95); opacity: 0; filter: blur(10px); }
        }
        #alert-text {
            font-size: 3rem;
            font-weight: 700;
            color: #fff;
            letter-spacing: 2px;
            text-shadow: 0 0 20px rgba(255,255,255,0.5), 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000;
        }
    </style>
</head>
<body>
    <div id="alert-box" class="hidden">
        <div id="media-container"></div>
        <h2 id="alert-text"></h2>
    </div>

    <script>
        // Configuration
        const config = {
            channel: "${channel}",
            duration: ${duration},
            textTemplate: "${template.replace(/"/g, '\\"')}",
            mediaData: "${mediaData}",
            mediaType: "${mediaType}"
        };

        const alertBox = document.getElementById('alert-box');
        const mediaContainer = document.getElementById('media-container');
        const alertText = document.getElementById('alert-text');
        
        let eventQueue = [];
        let isPlaying = false;

        // Build media element once
        let mediaElement = null;
        if (config.mediaType === 'video') {
            mediaElement = document.createElement('video');
            mediaElement.src = config.mediaData;
            mediaElement.muted = false;
            mediaElement.loop = true;
        } else {
            mediaElement = document.createElement('img');
            mediaElement.src = config.mediaData;
        }

        // TMI Setup
        const client = new tmi.Client({ channels: [ config.channel ] });
        
        client.on('subscription', (channel, username, method, message, userstate) => {
            queueAlert(username);
        });
        
        client.on('resub', (channel, username, months, message, userstate, methods) => {
            queueAlert(username);
        });
        
        client.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
            queueAlert(recipient); 
        });

        client.connect().catch(console.error);

        function queueAlert(username) {
            eventQueue.push(username);
            if(!isPlaying) processQueue();
        }

        async function processQueue() {
            if (eventQueue.length === 0) return;
            isPlaying = true;
            const username = eventQueue.shift();
            
            await showOverlay(username);
            
            isPlaying = false;
            setTimeout(processQueue, 1000);
        }

        function showOverlay(username) {
            return new Promise((resolve) => {
                alertText.textContent = config.textTemplate.replace('{user}', username);
                mediaContainer.innerHTML = '';
                mediaContainer.appendChild(mediaElement);
                
                if(config.mediaType === 'video') {
                    mediaElement.currentTime = 0;
                    mediaElement.play().catch(e => console.log('Video autoplay blocked:', e));
                }

                alertBox.classList.remove('hidden');
                alertBox.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

                setTimeout(() => {
                    alertBox.style.animation = 'popOut 0.5s ease forwards';
                    setTimeout(() => {
                        alertBox.classList.add('hidden');
                        if(config.mediaType === 'video') {
                            mediaElement.pause();
                        }
                        resolve();
                    }, 500);
                }, config.duration * 1000);
            });
        }
    <\\/script>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `overlay_${channel}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Preview Logic
    testBtn.addEventListener('click', () => {
        if (!currentMediaDataUrl) {
            alert('PLEASE UPLOAD A MEDIA FILE TO PREVIEW');
            return;
        }
        previewModal.classList.remove('hidden');
        triggerPreviewAlert("TESTER_" + Math.floor(Math.random() * 99));
    });

    closePreviewBtn.addEventListener('click', () => {
        previewModal.classList.add('hidden');
        alertBox.classList.add('hidden');
        mediaContainer.innerHTML = '';
    });

    function triggerPreviewAlert(username) {
        alertText.textContent = textTemplateInput.value.replace('{user}', username);
        mediaContainer.innerHTML = '';
        
        let el;
        if (currentMediaType === 'video') {
            el = document.createElement('video');
            el.src = currentMediaDataUrl;
            el.muted = true; // mute in preview
            el.loop = true;
            el.autoplay = true;
        } else {
            el = document.createElement('img');
            el.src = currentMediaDataUrl;
        }
        mediaContainer.appendChild(el);

        alertBox.classList.remove('hidden');
        alertBox.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

        const duration = parseInt(durationInput.value) || 5;

        setTimeout(() => {
            alertBox.style.animation = 'popOut 0.5s ease forwards';
            setTimeout(() => {
                alertBox.classList.add('hidden');
            }, 500);
        }, duration * 1000);
    }
});
