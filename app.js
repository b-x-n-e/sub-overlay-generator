document.addEventListener('DOMContentLoaded', async () => {
    const setupContainer = document.getElementById('setup-container');
    const overlayContainer = document.getElementById('overlay-container');
    const alertBox = document.getElementById('alert-box');
    const mediaContainer = document.getElementById('media-container');
    const alertText = document.getElementById('alert-text');
    
    // Inputs
    const channelInput = document.getElementById('channel');
    const mediaInput = document.getElementById('media');
    const durationInput = document.getElementById('duration');
    const textTemplateInput = document.getElementById('text-template');
    const fileNameSpan = document.getElementById('file-name');
    
    // Buttons
    const saveBtn = document.getElementById('save-btn');
    const testBtn = document.getElementById('test-btn');

    let tmiClient = null;
    let isPlaying = false;
    let eventQueue = [];
    
    // Data stores
    let config = {
        channel: '',
        duration: 5,
        textTemplate: '{user} just subscribed!',
        mediaType: null
    };

    // Load config from LocalForage
    try {
        const savedConfig = await localforage.getItem('overlayConfig');
        if (savedConfig) {
            config = { ...config, ...savedConfig };
            channelInput.value = config.channel || '';
            durationInput.value = config.duration || 5;
            textTemplateInput.value = config.textTemplate || '{user} just subscribed!';
            if (config.mediaBlob) {
                fileNameSpan.textContent = "Media loaded from storage. Upload new to replace.";
            }
            
            // Auto start if fully configured and no ?setup=1 in URL
            const urlParams = new URLSearchParams(window.location.search);
            if (config.channel && config.mediaBlob && !urlParams.has('setup')) {
                startOverlay();
                return; // skip showing setup
            }
        }
    } catch(e) {
        console.error("LocalForage load error:", e);
    }

    // UI Interactions
    const dropArea = document.getElementById('drop-area');
    
    mediaInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileNameSpan.textContent = file.name;
        } else {
            fileNameSpan.textContent = "Drag & Drop or Click to Upload";
        }
    });

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
        let dt = e.dataTransfer;
        let files = dt.files;
        if(files.length > 0) {
            mediaInput.files = files; // Assign to input
            fileNameSpan.textContent = files[0].name;
        }
    });

    saveBtn.addEventListener('click', async () => {
        const newChannel = channelInput.value.trim().toLowerCase();
        
        if (!newChannel) {
            alert('Please enter a Twitch channel name.');
            return;
        }
        
        config.channel = newChannel;
        config.duration = parseInt(durationInput.value) || 5;
        config.textTemplate = textTemplateInput.value;
        
        const files = mediaInput.files;
        if (files && files.length > 0) {
            const file = files[0];
            config.mediaBlob = file;
            config.mediaType = file.type.startsWith('video') ? 'video' : 'image';
        } else if (!config.mediaBlob) {
            alert('Please upload a media file.');
            return;
        }

        try {
            await localforage.setItem('overlayConfig', config);
        } catch(e) {
            console.error("Failed to save config:", e);
        }
        
        startOverlay();
    });

    testBtn.addEventListener('click', () => {
        // Read directly from inputs for live test without saving
        const tempText = textTemplateInput.value;
        const tempFiles = mediaInput.files;
        
        // Mock event setup
        const testUser = "CrazyGamer" + Math.floor(Math.random() * 100);
        
        // Push fake job directly logic
        queueAlert(testUser, true); 
    });

    function startOverlay() {
        document.body.classList.remove('setup-mode');
        setupContainer.classList.add('hidden');
        overlayContainer.classList.remove('hidden');

        // Connect TMI
        if (!tmiClient) {
            tmiClient = new tmi.Client({
                channels: [ config.channel ]
            });
            
            tmiClient.on('subscription', (channel, username, method, message, userstate) => {
                queueAlert(username);
            });
            
            tmiClient.on('resub', (channel, username, months, message, userstate, methods) => {
                queueAlert(username);
            });
            
            tmiClient.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
                queueAlert(recipient); 
            });

            tmiClient.connect().catch(console.error);
        }
    }

    function queueAlert(username, isTest = false) {
        eventQueue.push({ username, isTest });
        if(!isPlaying) {
            processQueue();
        }
    }

    async function processQueue() {
        if (eventQueue.length === 0) return;
        
        isPlaying = true;
        const event = eventQueue.shift();
        
        await triggerAlert(event.username, event.isTest);
        
        isPlaying = false;
        // Wait 1 second before next alert if any
        setTimeout(processQueue, 1000);
    }

    function triggerAlert(username, isTest = false) {
        return new Promise((resolve) => {
            alertBox.classList.remove('hidden');
            alertBox.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
            
            // set text
            const template = isTest ? textTemplateInput.value : config.textTemplate;
            const text = template.replace('{user}', username);
            alertText.textContent = text;
            
            // set media
            mediaContainer.innerHTML = ''; 
            let mediaUrl = "";
            let element = null;

            // Priority: File newly uploaded during test vs Saved blob
            const files = mediaInput.files;
            let blobToUse = config.mediaBlob;
            let typeToUse = config.mediaType;

            if (isTest && files && files.length > 0) {
                blobToUse = files[0];
                typeToUse = blobToUse.type.startsWith('video') ? 'video' : 'image';
            }

            if (blobToUse) {
                mediaUrl = URL.createObjectURL(blobToUse);
            }

            if (typeToUse === 'video') {
                element = document.createElement('video');
                element.src = mediaUrl;
                element.autoplay = true;
                element.muted = false; 
                // Don't loop by default to prevent audio spam, or let duration handle it
                element.loop = true;
            } else if (typeToUse === 'image') {
                element = document.createElement('img');
                element.src = mediaUrl;
            }
            
            if(element) mediaContainer.appendChild(element);

            const durationOverride = isTest ? (parseInt(durationInput.value) || 5) : config.duration;

            // Wait for duration
            setTimeout(() => {
                alertBox.style.animation = 'popOut 0.5s ease forwards';
                
                setTimeout(() => {
                    alertBox.classList.add('hidden');
                    if(mediaUrl) URL.revokeObjectURL(mediaUrl);
                    resolve();
                }, 500); // wait for popOut to finish
            }, durationOverride * 1000);
        });
    }
});
