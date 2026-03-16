document.addEventListener('DOMContentLoaded', () => {
    // ===== REFS =====
    const channelInput = document.getElementById('channel');
    const useGlobalAudioCb = document.getElementById('use-global-audio');
    const globalAudioArea = document.getElementById('global-audio-area');
    const generateBtn = document.getElementById('generate-btn');
    const testBtn = document.getElementById('test-btn');
    const previewModal = document.getElementById('preview-modal');
    const closePreviewBtn = document.getElementById('close-preview');
    const alertBox = document.getElementById('alert-box');
    const mediaContainer = document.getElementById('media-container');
    const alertText = document.getElementById('alert-text');

    const EVENT_KEYS = ['tier1', 'tier2', 'tier3', 'gift', 'massgift'];

    // Store base64 data URLs keyed by their data-key attribute
    const fileData = {};

    // ===== FILE HANDLING =====
    document.querySelectorAll('.file-drop-area').forEach(area => {
        const input = area.querySelector('input[type="file"]');
        const textEl = area.querySelector('.drop-text');
        const key = input.dataset.key;

        input.addEventListener('change', () => handleFileSelect(input, area, textEl, key));

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
            area.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false)
        );
        ['dragenter', 'dragover'].forEach(ev =>
            area.addEventListener(ev, () => area.classList.add('dragover'))
        );
        ['dragleave', 'drop'].forEach(ev =>
            area.addEventListener(ev, () => area.classList.remove('dragover'))
        );
        area.addEventListener('drop', e => {
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                handleFileSelect(input, area, textEl, key);
            }
        });
    });

    function handleFileSelect(input, area, textEl, key) {
        if (!input.files.length) return;
        const file = input.files[0];
        textEl.innerHTML = file.name;
        area.classList.add('has-file');

        const reader = new FileReader();
        reader.onload = e => {
            fileData[key] = {
                dataUrl: e.target.result,
                type: file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image'
            };
        };
        reader.readAsDataURL(file);
    }

    // ===== TOGGLE: GLOBAL AUDIO vs PER-EVENT =====
    useGlobalAudioCb.addEventListener('change', syncAudioVisibility);
    syncAudioVisibility();

    function syncAudioVisibility() {
        const global = useGlobalAudioCb.checked;
        globalAudioArea.style.display = global ? '' : 'none';
        document.querySelectorAll('.per-event-audio').forEach(el => {
            el.style.display = global ? 'none' : '';
        });
    }

    // ===== EVENT TOGGLES =====
    document.querySelectorAll('.event-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
            const block = cb.closest('.event-block');
            const body = block.querySelector('.event-body');
            if (cb.checked) {
                body.style.display = '';
                block.classList.add('active');
            } else {
                body.style.display = 'none';
                block.classList.remove('active');
            }
        });
        // init state
        const block = cb.closest('.event-block');
        if (cb.checked) {
            block.querySelector('.event-body').style.display = '';
            block.classList.add('active');
        }
    });

    // ===== COLLECT CONFIG =====
    function collectConfig() {
        const channel = channelInput.value.trim().toLowerCase();
        if (!channel) { alert('Please enter a Twitch channel name.'); return null; }

        const useGlobalAudio = useGlobalAudioCb.checked;
        const globalAudio = useGlobalAudio ? (fileData['global-audio'] || null) : null;

        const events = {};
        let hasAnyEnabled = false;

        EVENT_KEYS.forEach(key => {
            const toggle = document.querySelector(`.event-toggle[data-event="${key}"]`);
            if (!toggle || !toggle.checked) return;

            const media = fileData[`${key}-media`];
            if (!media) { alert(`Please upload media for the "${key}" event.`); return; }

            const textInput = document.querySelector(`.event-text[data-event="${key}"]`);
            const durInput = document.querySelector(`.event-duration[data-event="${key}"]`);

            let audio = null;
            if (useGlobalAudio) {
                audio = globalAudio;
            } else {
                audio = fileData[`${key}-audio`] || null;
            }

            events[key] = {
                mediaData: media.dataUrl,
                mediaType: media.type,
                audioData: audio ? audio.dataUrl : null,
                text: textInput.value,
                duration: parseInt(durInput.value) || 5
            };
            hasAnyEnabled = true;
        });

        if (!hasAnyEnabled) { alert('Please enable and configure at least one event.'); return null; }

        return { channel, events };
    }

    // ===== GENERATE HTML =====
    generateBtn.addEventListener('click', () => {
        const config = collectConfig();
        if (!config) return;
        downloadOverlay(config);
    });

    function downloadOverlay(config) {
        const eventsJSON = JSON.stringify(config.events).replace(/<\/script>/gi, '<\\/script>');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sub Overlay – ${config.channel}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/tmi.js/1.8.5/tmi.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;overflow:hidden;font-family:'Inter',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh}
.hidden{display:none!important}
#alert-box{text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.25rem}
#media-container img,#media-container video{max-width:800px;max-height:500px;border-radius:8px}
@keyframes alertIn{0%{transform:scale(.9);opacity:0;filter:blur(12px)}100%{transform:scale(1);opacity:1;filter:blur(0)}}
@keyframes alertOut{0%{transform:scale(1);opacity:1;filter:blur(0)}100%{transform:scale(.9);opacity:0;filter:blur(12px)}}
#alert-text{font-size:3rem;font-weight:700;color:#fff;text-shadow:0 0 20px rgba(255,255,255,.3),0 2px 4px rgba(0,0,0,.8)}
</style>
</head>
<body>
<div id="alert-box" class="hidden">
<div id="media-container"></div>
<h2 id="alert-text"></h2>
</div>
<script>
(function(){
var CHANNEL="${config.channel}";
var EVENTS=${eventsJSON};

var alertBox=document.getElementById('alert-box');
var mediaContainer=document.getElementById('media-container');
var alertText=document.getElementById('alert-text');
var queue=[];
var playing=false;

function getTier(userstate){
    var plan=userstate&&userstate['msg-param-sub-plan'];
    if(!plan||plan==='Prime'||plan==='1000')return 'tier1';
    if(plan==='2000')return 'tier2';
    if(plan==='3000')return 'tier3';
    return 'tier1';
}

var client=new tmi.Client({channels:[CHANNEL]});

client.on('subscription',function(channel,username,method,message,userstate){
    var tier=getTier(userstate);
    if(EVENTS[tier])q(tier,{user:username});
});

client.on('resub',function(channel,username,months,message,userstate,methods){
    var tier=getTier(userstate);
    if(EVENTS[tier])q(tier,{user:username});
});

client.on('subgift',function(channel,username,streakMonths,recipient,methods,userstate){
    if(EVENTS.gift)q('gift',{user:recipient,gifter:username});
});

client.on('submysterygift',function(channel,username,numbOfGifts,methods,userstate){
    if(EVENTS.massgift)q('massgift',{user:username,count:numbOfGifts});
});

client.connect().catch(console.error);

function q(eventKey,vars){queue.push({key:eventKey,vars:vars});if(!playing)proc();}

function proc(){
    if(!queue.length)return;
    playing=true;
    var item=queue.shift();
    show(item.key,item.vars);
}

function show(eventKey,vars){
    var ev=EVENTS[eventKey];
    if(!ev){playing=false;setTimeout(proc,500);return;}

    var text=ev.text;
    if(vars){for(var k in vars){text=text.split('{'+k+'}').join(vars[k]);}}
    alertText.textContent=text;

    mediaContainer.innerHTML='';
    var el;
    if(ev.mediaType==='video'){
        el=document.createElement('video');
        el.src=ev.mediaData;
        el.loop=true;
        el.muted=true;
    }else{
        el=document.createElement('img');
        el.src=ev.mediaData;
    }
    mediaContainer.appendChild(el);
    if(ev.mediaType==='video'){el.currentTime=0;el.play().catch(function(){});}

    var audioEl=null;
    if(ev.audioData){
        audioEl=new Audio(ev.audioData);
        audioEl.play().catch(function(){});
    }

    alertBox.classList.remove('hidden');
    alertBox.style.animation='alertIn .8s cubic-bezier(.175,.885,.32,1.275) forwards';

    setTimeout(function(){
        alertBox.style.animation='alertOut .5s ease forwards';
        setTimeout(function(){
            alertBox.classList.add('hidden');
            if(ev.mediaType==='video'&&el)el.pause();
            if(audioEl){audioEl.pause();audioEl=null;}
            playing=false;
            setTimeout(proc,1000);
        },500);
    },ev.duration*1000);
}
})();
<\/script>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `overlay_${config.channel}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===== PREVIEW =====
    testBtn.addEventListener('click', () => {
        // Find enabled events
        const enabledKeys = EVENT_KEYS.filter(k => {
            const cb = document.querySelector(`.event-toggle[data-event="${k}"]`);
            return cb && cb.checked && fileData[`${k}-media`];
        });

        if (!enabledKeys.length) {
            alert('Enable at least one event with media uploaded to preview.');
            return;
        }

        // Pick a random enabled event
        const key = enabledKeys[Math.floor(Math.random() * enabledKeys.length)];
        const media = fileData[`${key}-media`];
        const textInput = document.querySelector(`.event-text[data-event="${key}"]`);
        const durInput = document.querySelector(`.event-duration[data-event="${key}"]`);

        const useGlobal = useGlobalAudioCb.checked;
        const audio = useGlobal ? (fileData['global-audio'] || null) : (fileData[`${key}-audio`] || null);

        const names = { tier1: 'Tier1Fan', tier2: 'Tier2Pro', tier3: 'Tier3Ultra', gift: 'GenerousGifter', massgift: 'MegaGifter' };
        const testVars = {
            user: names[key] || 'TestUser',
            gifter: 'BigSpender',
            count: '100'
        };

        let text = textInput.value;
        for (const k in testVars) { text = text.split('{' + k + '}').join(testVars[k]); }

        previewModal.classList.remove('hidden');

        // Build media
        mediaContainer.innerHTML = '';
        let el;
        if (media.type === 'video') {
            el = document.createElement('video');
            el.src = media.dataUrl;
            el.muted = true;
            el.loop = true;
            el.autoplay = true;
        } else {
            el = document.createElement('img');
            el.src = media.dataUrl;
        }
        mediaContainer.appendChild(el);

        alertText.textContent = text;

        // Play audio in preview (muted by default to avoid autoplay blocks)
        let audioEl = null;
        if (audio) {
            audioEl = new Audio(audio.dataUrl);
            audioEl.play().catch(() => {});
        }

        alertBox.classList.remove('hidden');
        alertBox.style.animation = 'alertIn 0.8s cubic-bezier(0.175,0.885,0.32,1.275) forwards';

        const dur = parseInt(durInput.value) || 5;
        setTimeout(() => {
            alertBox.style.animation = 'alertOut 0.5s ease forwards';
            setTimeout(() => {
                alertBox.classList.add('hidden');
                if (audioEl) { audioEl.pause(); }
            }, 500);
        }, dur * 1000);
    });

    closePreviewBtn.addEventListener('click', () => {
        previewModal.classList.add('hidden');
        alertBox.classList.add('hidden');
        mediaContainer.innerHTML = '';
    });
});
