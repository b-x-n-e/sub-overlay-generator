document.addEventListener('DOMContentLoaded', () => {
    // DOM refs
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

    // ===== FILE HANDLING =====
    mediaInput.addEventListener('change', handleFile);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
        dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false)
    );

    ['dragenter', 'dragover'].forEach(ev =>
        dropArea.addEventListener(ev, () => dropArea.classList.add('dragover'), false)
    );

    ['dragleave', 'drop'].forEach(ev =>
        dropArea.addEventListener(ev, () => dropArea.classList.remove('dragover'), false)
    );

    dropArea.addEventListener('drop', e => {
        if (e.dataTransfer.files.length > 0) {
            mediaInput.files = e.dataTransfer.files;
            handleFile({ target: mediaInput });
        }
    });

    function handleFile(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileNameSpan.innerHTML = file.name;
            dropArea.classList.add('has-file');
            currentMediaType = file.type.startsWith('video') ? 'video' : 'image';
            const reader = new FileReader();
            reader.onload = ev => { currentMediaDataUrl = ev.target.result; };
            reader.readAsDataURL(file);
        } else {
            fileNameSpan.innerHTML = 'Drop a <strong>GIF</strong> or <strong>MP4</strong> here';
            dropArea.classList.remove('has-file');
            currentMediaDataUrl = null;
        }
    }

    // ===== GENERATE OVERLAY HTML =====
    generateBtn.addEventListener('click', () => {
        const channel = channelInput.value.trim().toLowerCase();
        const duration = parseInt(durationInput.value) || 5;
        const textTemplate = textTemplateInput.value;

        if (!channel) { alert('Please enter a Twitch channel name.'); return; }
        if (!currentMediaDataUrl) { alert('Please upload a media file.'); return; }

        downloadOverlay(channel, duration, textTemplate, currentMediaDataUrl, currentMediaType);
    });

    function downloadOverlay(channel, duration, template, mediaData, mediaType) {
        const escapedTemplate = template.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sub Overlay – ${channel}</title>
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
#alert-text{font-size:3rem;font-weight:700;color:#fff;text-shadow:0 0 30px rgba(167,139,250,.5),0 2px 4px rgba(0,0,0,.8)}
</style>
</head>
<body>
<div id="alert-box" class="hidden">
<div id="media-container"></div>
<h2 id="alert-text"></h2>
</div>
<script>
(function(){
var CHANNEL="${channel}";
var DURATION=${duration};
var TEMPLATE="${escapedTemplate}";
var MEDIA_DATA="${mediaData}";
var MEDIA_TYPE="${mediaType}";

var alertBox=document.getElementById('alert-box');
var mediaContainer=document.getElementById('media-container');
var alertText=document.getElementById('alert-text');
var queue=[];
var playing=false;

var el;
if(MEDIA_TYPE==='video'){el=document.createElement('video');el.src=MEDIA_DATA;el.loop=true;}
else{el=document.createElement('img');el.src=MEDIA_DATA;}

var client=new tmi.Client({channels:[CHANNEL]});
client.on('subscription',function(c,u){q(u)});
client.on('resub',function(c,u){q(u)});
client.on('subgift',function(c,u,s,r){q(r)});
client.connect().catch(console.error);

function q(u){queue.push(u);if(!playing)proc();}
function proc(){
if(!queue.length)return;
playing=true;
var u=queue.shift();
alertText.textContent=TEMPLATE.replace('{user}',u);
mediaContainer.innerHTML='';
mediaContainer.appendChild(el);
if(MEDIA_TYPE==='video'){el.currentTime=0;el.play().catch(function(){});}
alertBox.classList.remove('hidden');
alertBox.style.animation='alertIn .8s cubic-bezier(.175,.885,.32,1.275) forwards';
setTimeout(function(){
alertBox.style.animation='alertOut .5s ease forwards';
setTimeout(function(){
alertBox.classList.add('hidden');
if(MEDIA_TYPE==='video')el.pause();
playing=false;
setTimeout(proc,1000);
},500);
},DURATION*1000);
}
})();
<\/script>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `overlay_${channel}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===== PREVIEW =====
    testBtn.addEventListener('click', () => {
        if (!currentMediaDataUrl) { alert('Upload a media file first to preview.'); return; }
        previewModal.classList.remove('hidden');
        runPreview('TestUser' + Math.floor(Math.random() * 99));
    });

    closePreviewBtn.addEventListener('click', () => {
        previewModal.classList.add('hidden');
        alertBox.classList.add('hidden');
        mediaContainer.innerHTML = '';
    });

    function runPreview(username) {
        const template = textTemplateInput.value;
        alertText.textContent = template.replace('{user}', username);
        mediaContainer.innerHTML = '';

        let el;
        if (currentMediaType === 'video') {
            el = document.createElement('video');
            el.src = currentMediaDataUrl;
            el.muted = true;
            el.loop = true;
            el.autoplay = true;
        } else {
            el = document.createElement('img');
            el.src = currentMediaDataUrl;
        }
        mediaContainer.appendChild(el);

        alertBox.classList.remove('hidden');
        alertBox.style.animation = 'alertIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

        const dur = parseInt(durationInput.value) || 5;
        setTimeout(() => {
            alertBox.style.animation = 'alertOut 0.5s ease forwards';
            setTimeout(() => { alertBox.classList.add('hidden'); }, 500);
        }, dur * 1000);
    }
});
