document.addEventListener('DOMContentLoaded', () => {
    // ===== REFS =====
    const channelInput = document.getElementById('channel');
    const oauthTokenInput = document.getElementById('oauth-token');
    const userIdInput = document.getElementById('user-id');
    const oauthSection = document.getElementById('oauth-section');
    const useGlobalAudioCb = document.getElementById('use-global-audio');
    const globalAudioArea = document.getElementById('global-audio-area');
    const generateBtn = document.getElementById('generate-btn');
    const testBtn = document.getElementById('test-btn');
    const previewModal = document.getElementById('preview-modal');
    const closePreviewBtn = document.getElementById('close-preview');
    const alertBox = document.getElementById('alert-box');
    const mediaContainer = document.getElementById('media-container');
    const alertText = document.getElementById('alert-text');

    const EVENT_KEYS = ['follow', 'tier1', 'tier2', 'tier3', 'gift', 'massgift'];

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

    // ===== OAUTH SECTION VISIBILITY =====
    function syncOauthVisibility() {
        const followToggle = document.querySelector('.event-toggle[data-event="follow"]');
        const followEnabled = followToggle && followToggle.checked;
        oauthSection.style.display = followEnabled ? '' : 'none';
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
            syncOauthVisibility();
        });
        // init state
        const block = cb.closest('.event-block');
        if (cb.checked) {
            block.querySelector('.event-body').style.display = '';
            block.classList.add('active');
        }
    });
    syncOauthVisibility();

    // ===== COLLECT CONFIG =====
    function collectConfig() {
        const channel = channelInput.value.trim().toLowerCase();
        if (!channel) { alert('Please enter a Twitch channel name.'); return null; }

        const useGlobalAudio = useGlobalAudioCb.checked;
        const globalAudio = useGlobalAudio ? (fileData['global-audio'] || null) : null;

        const followToggle = document.querySelector('.event-toggle[data-event="follow"]');
        const followEnabled = followToggle && followToggle.checked;

        let oauthToken = '';
        let userId = '';

        if (followEnabled) {
            oauthToken = oauthTokenInput.value.trim();
            userId = userIdInput.value.trim();
            if (!oauthToken) { alert('Follow alerts require an OAuth token. Please enter one.'); return null; }
            if (!userId) { alert('Follow alerts require your Twitch User ID. Please enter one.'); return null; }
            // Strip "oauth:" prefix if the user included it
            if (oauthToken.toLowerCase().startsWith('oauth:')) {
                oauthToken = oauthToken.substring(6);
            }
        }

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

        return { channel, events, oauthToken, userId, followEnabled };
    }

    // ===== GENERATE HTML =====
    generateBtn.addEventListener('click', () => {
        const config = collectConfig();
        if (!config) return;
        downloadOverlay(config);
    });

    function downloadOverlay(config) {
        const eventsJSON = JSON.stringify(config.events).replace(/<\/script>/gi, '<\\/script>');

        // Determine if we need tmi.js (for sub events)
        const hasSubEvents = ['tier1','tier2','tier3','gift','massgift'].some(k => config.events[k]);
        const tmiScript = hasSubEvents
            ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/tmi.js/1.8.5/tmi.min.js"><\\/script>`
            : '';

        // Build tmi.js sub listener code (only if sub events exist)
        const tmiCode = hasSubEvents ? `
// === TMI.JS — Sub Events ===
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
` : '';

        // Build EventSub WebSocket code (only if follow is enabled)
        const eventSubCode = config.followEnabled ? `
// === EVENTSUB WEBSOCKET — Follow Events ===
var OAUTH_TOKEN="${config.oauthToken}";
var USER_ID="${config.userId}";
var esWs=null;
var keepaliveTimeout=null;
var CLIENT_ID="";

// First, get the client ID associated with this token
fetch("https://id.twitch.tv/oauth2/validate",{headers:{"Authorization":"OAuth "+OAUTH_TOKEN}})
.then(function(r){return r.json();})
.then(function(data){
    if(!data.client_id){console.error("Invalid OAuth token");return;}
    CLIENT_ID=data.client_id;
    connectEventSub();
})
.catch(function(e){console.error("Token validation failed:",e);});

function connectEventSub(reconnectUrl){
    var url=reconnectUrl||"wss://eventsub.wss.twitch.tv/ws";
    esWs=new WebSocket(url);

    esWs.onmessage=function(event){
        var msg=JSON.parse(event.data);
        var type=msg.metadata&&msg.metadata.message_type;

        if(type==="session_welcome"){
            var sessionId=msg.payload.session.id;
            var ka=msg.payload.session.keepalive_timeout_seconds||30;
            resetKeepalive(ka);
            // Subscribe to channel.follow v2
            fetch("https://api.twitch.tv/helix/eventsub/subscriptions",{
                method:"POST",
                headers:{
                    "Authorization":"Bearer "+OAUTH_TOKEN,
                    "Client-Id":CLIENT_ID,
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    type:"channel.follow",
                    version:"2",
                    condition:{broadcaster_user_id:USER_ID,moderator_user_id:USER_ID},
                    transport:{method:"websocket",session_id:sessionId}
                })
            })
            .then(function(r){return r.json();})
            .then(function(d){
                if(d.data&&d.data.length){console.log("Subscribed to channel.follow");}
                else{console.error("Follow sub failed:",d);}
            })
            .catch(function(e){console.error("Follow sub error:",e);});
        }
        else if(type==="notification"){
            resetKeepalive(30);
            var sub=msg.payload.subscription;
            if(sub&&sub.type==="channel.follow"){
                var follower=msg.payload.event.user_name;
                if(EVENTS.follow)q("follow",{user:follower});
            }
        }
        else if(type==="session_keepalive"){
            resetKeepalive(30);
        }
        else if(type==="session_reconnect"){
            var newUrl=msg.payload.session.reconnect_url;
            connectEventSub(newUrl);
        }
        else if(type==="revocation"){
            console.warn("EventSub subscription revoked:",msg.payload.subscription.status);
        }
    };

    esWs.onerror=function(e){console.error("EventSub WS error:",e);};
    esWs.onclose=function(){
        console.log("EventSub WS closed, reconnecting in 5s...");
        setTimeout(function(){connectEventSub();},5000);
    };
}

function resetKeepalive(seconds){
    if(keepaliveTimeout)clearTimeout(keepaliveTimeout);
    keepaliveTimeout=setTimeout(function(){
        console.warn("Keepalive timeout, reconnecting...");
        if(esWs)esWs.close();
        connectEventSub();
    },(seconds+5)*1000);
}
` : '';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Stream Overlay – ${config.channel}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet">
${tmiScript}
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
${tmiCode}${eventSubCode}
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
<\\/script>
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

        const names = { follow: 'NewFollower', tier1: 'Tier1Fan', tier2: 'Tier2Pro', tier3: 'Tier3Ultra', gift: 'GenerousGifter', massgift: 'MegaGifter' };
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
