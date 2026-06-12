// Global Değişkenler
let socket;
let localStream;
let peerConnection;
let currentUsername = "Sen";
let isMatched = false;

// HTML Elementleri
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const remoteUsernameSpan = document.getElementById('remoteUsername');

// WebRTC STUN Sunucuları (Google'ın ücretsiz sunucuları)
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// --- 1. SİSTEMİ BAŞLAT (Firebase girişi başarılı olduğunda index.html'den çağrılır) ---
window.startAppWithUser = async function(username) {
    currentUsername = username;
    
    // Kameraya ve mikrofona erişim iste
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        // Socket.io Bağlantısını Başlat
        initSocket();
    } catch (err) {
        alert("Kamera ve mikrofon erişimine izin vermeniz gerekiyor: " + err.message);
        console.error(err);
    }
};

// --- 2. SOCKET BAĞLANTISI VE DİNLEYİCİLER ---
function initSocket() {
    socket = io(); // Bağlantıyı kur

    // Sıraya katıl
    socket.emit('join', currentUsername);
    addSystemMessage("Sunucuya bağlanıldı, partner aranıyor...");

    socket.on('waiting', (msg) => {
        remoteUsernameSpan.innerText = "Aranıyor...";
        remoteVideo.srcObject = null;
        isMatched = false;
        addSystemMessage("Eşleşme bekleniyor...");
    });

    socket.on('matched', async (data) => {
        isMatched = true;
        remoteUsernameSpan.innerText = data.partnerName;
        addSystemMessage(`Sohbete katıldı: ${data.partnerName}! Merhaba deyin.`);
        
        createPeerConnection();

        // Eşleşmede 1. kişi teklif (offer) gönderir, diğeri bekler
        if (data.initiator) {
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit('offer', offer);
            } catch (err) {
                console.error("Offer hatası:", err);
            }
        }
    });

    socket.on('offer', async (offer) => {
        if (!peerConnection) createPeerConnection();
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
        } catch (err) {
            console.error("Answer hatası:", err);
        }
    });

    socket.on('answer', async (answer) => {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error("Remote desc hatası:", err);
        }
    });

    socket.on('ice-candidate', (candidate) => {
        try {
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("ICE hatası:", err);
        }
    });

    socket.on('chat-message', (msg) => {
        appendMessage(msg, 'stranger');
    });

    socket.on('partner-disconnected', () => {
        isMatched = false;
        remoteVideo.srcObject = null;
        remoteUsernameSpan.innerText = "Ayrıldı";
        addSystemMessage("Yabancı bağlantıdan ayrıldı. Yeni kişi aranıyor...");
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
    });
}

// --- 3. WEBRTC BAĞLANTISI (P2P) ---
function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }
    
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Kendi kameramızı karşı tarafa ekle
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Karşı tarafın kamerası geldiğinde
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // ICE (Ağ yolu bulma) işlemleri
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };
}

// --- 4. SOHBET (CHAT) KISMI ---
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (text !== "" && isMatched) {
        appendMessage(text, 'me');
        socket.emit('chat-message', text);
        chatInput.value = "";
    } else if (!isMatched) {
        addSystemMessage("Şu an kimseyle bağlı değilsiniz.");
    }
}

function appendMessage(text, type) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', type);
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Otomatik aşağı kaydır
}

function addSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', 'system');
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- 5. "GEÇ" BUTONU FONKSİYONU ---
window.skipToNextUser = function() {
    if (!socket) return;
    
    isMatched = false;
    remoteVideo.srcObject = null;
    remoteUsernameSpan.innerText = "Geçiliyor...";
    addSystemMessage("Mevcut kişiyi geçtiniz. Yeni kişi aranıyor...");
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Sunucuya geçmek istediğimizi bildiriyoruz, bizi tekrar sıraya sokacak
    socket.emit('skip');
};