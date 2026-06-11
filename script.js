// ARKA PLAN SUNUCUNUN URL ADRESİNİ BURAYA YAZMALISIN:
const BACKEND_URL = "https://https://zomechat.onrender.com/"; // Örnektir, kendi adresinle değiştir.

const socket = io(BACKEND_URL);

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const remoteVideoContainer = document.getElementById('remoteVideoContainer');
const statusText = document.getElementById('status');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const localUsernameEl = document.getElementById('localUsername');
const remoteUsernameEl = document.getElementById('remoteUsername');
const loginScreen = document.getElementById('loginScreen');

let localStream = null;
let peerConnection = null;
let currentRoom = null;
let myNickname = "Kullanıcı";

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Giriş yapıldığında arayüzü hazırlar
window.startAppWithUser = function(displayName) {
    myNickname = displayName || "ZOME Kullanıcısı";
    if (localUsernameEl) localUsernameEl.innerText = myNickname;
    
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.style.display = 'none';
            if (!localStream) initCamera();
        }, 400);
    }
};

// Çıkış yapıldığında çalışır
window.showLoginScreen = function() {
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        setTimeout(() => { loginScreen.style.opacity = '1'; }, 50);
    }
    resetConnection();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (localVideo) localVideo.srcObject = null;
    if (statusText) statusText.innerText = "Lütfen giriş yapın...";
};

async function initCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        if (statusText) statusText.innerText = "ZOMEchat'e hoş geldiniz!";
        skipToNextUser();
    } catch (err) {
        if (statusText) statusText.innerText = "Hata: Kamera izni verilmedi!";
        console.error("Kamera erişim hatası:", err);
    }
}

function skipToNextUser() {
    resetConnection();
    appendSystemMessage("Yeni bir yabancı aranıyor...");
    if (statusText) statusText.innerText = "Eşleşme aranıyor...";
    
    socket.emit('leave-match');
    socket.emit('join-match', { nickname: myNickname });
}

// KAYDIRMA (SWIPE) ALGORİTMASI
let startX = 0;
let isDragging = false;

if (remoteVideoContainer) {
    remoteVideoContainer.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].screenX; }, { passive: true });
    remoteVideoContainer.addEventListener('touchend', (e) => { evaluateSwipe(startX, e.changedTouches[0].screenX); }, { passive: true });
    
    remoteVideoContainer.addEventListener('mousedown', (e) => { startX = e.screenX; isDragging = true; });
    window.addEventListener('mouseup', (e) => { 
        if (!isDragging) return; 
        isDragging = false; 
        evaluateSwipe(startX, e.screenX); 
    });
}

function evaluateSwipe(start, end) {
    if (end - start > 70) { skipToNextUser(); }
}

// WEBRTC VE SINYALLEŞME BAĞLANTILARI
socket.on('matched', async (data) => {
    currentRoom = data.roomName;
    const strangerName = data.strangerNickname || "Yabancı";
    if (remoteUsernameEl) remoteUsernameEl.innerText = strangerName;
    if (statusText) statusText.innerText = `${strangerName} ile bağlandınız!`;
    appendSystemMessage(`Sohbet başladı: ${strangerName} odada.`);
    
    createPeerConnection();

    if (data.isInitiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { roomName: currentRoom, sdp: peerConnection.localDescription });
        } catch (err) { console.error("Teklif oluşturma hatası:", err); }
    }
});

socket.on('waiting', (msg) => { if (statusText) statusText.innerText = msg; });

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    if (localStream) { 
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream)); 
    }
    
    peerConnection.ontrack = (event) => { 
        if (event.streams && event.streams[0] && remoteVideo) {
            remoteVideo.srcObject = event.streams[0]; 
        }
    };
    
    peerConnection.onicecandidate = (event) => { 
        if (event.candidate && currentRoom) {
            socket.emit('signal', { roomName: currentRoom, candidate: event.candidate }); 
        }
    };
}

socket.on('signal', async (data) => {
    if (!peerConnection) return;
    try {
        if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', { roomName: currentRoom, sdp: peerConnection.localDescription });
            }
        } else if (data.candidate) { 
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); 
        }
    } catch (err) { console.error("Sinyal eşleşme hatası:", err); }
});

socket.on('peer-left', () => {
    appendSystemMessage("Yabancı sohbetten ayrıldı.");
    if (remoteUsernameEl) remoteUsernameEl.innerText = "Yabancı";
    skipToNextUser();
});

function resetConnection() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (chatInput) chatInput.value = "";
    currentRoom = null;
}

// METİN SOHBET YÖNETİMİ
if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!currentRoom) { appendSystemMessage("Mesaj iletmek için eşleşme bekleniyor..."); chatInput.value = ""; return; }
    if (!text) return;
    appendMessage(text, 'me');
    socket.emit('send-message', { text });
    chatInput.value = "";
}

socket.on('receive-message', (data) => { appendMessage(data.text, 'stranger'); });

function appendMessage(text, side) {
    if (!chatMessages) return;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', side);
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
    if (!chatMessages) return;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', 'system');
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}