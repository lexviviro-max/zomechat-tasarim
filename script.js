const socket = io(window.location.origin || 'http://localhost:3000');
let localStream;
let peerConnection;
let currentMode = 'login';

const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Sekme Geçişleri
function switchTab(mode) {
    currentMode = mode;
    document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
    document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
    document.getElementById('authUsername').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authSubmitBtn').innerText = mode === 'register' ? 'Kayıt Ol' : 'Giriş Yap';
}

// Uygulamayı Giriş Yapan İsimle Başlatma
function startAppWithUser(username) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('localUsername').innerText = username;
    initWebRTC(username);
}

// Oturumu Kontrol Etme
window.onload = () => {
    if (!window.auth) {
        console.error("Firebase başlatılamadı, alan adlarını kontrol edin.");
        return;
    }
    window.auth.onAuthStateChanged(user => {
        if (user) {
            startAppWithUser(user.displayName || user.email.split('@')[0]);
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
        }
    });
};

// Klasik Giriş ve Kayıt Submit İşlemi
async function handleAuthSubmit() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();

    if(!email || !password) { alert("Lütfen alanları doldurun."); return; }

    try {
        if (currentMode === 'register') {
            if(!username) { alert("Kullanıcı adı yazın."); return; }
            const res = await window.auth.createUserWithEmailAndPassword(email, password);
            await res.user.updateProfile({ displayName: username });
            startAppWithUser(username);
        } else {
            const res = await window.auth.signInWithEmailAndPassword(email, password);
            startAppWithUser(res.user.displayName || res.user.email.split('@')[0]);
        }
    } catch (err) {
        alert("Hata: " + err.message);
    }
}

// Google ile Giriş Tetikleyicisi
document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    try {
        const res = await window.auth.signInWithPopup(window.googleProvider);
        startAppWithUser(res.user.displayName);
    } catch (err) {
        alert("Google Giriş Hatası:\n" + err.message);
    }
});

// Çıkış Butonu
document.getElementById('logoutBtn').addEventListener('click', () => {
    window.auth.signOut().then(() => { window.location.reload(); });
});

// Görüntülü Sohbet Mantığı (WebRTC)
async function initWebRTC(username) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
        socket.emit('join-chat', { username });
        document.getElementById('status').innerText = "Kullanıcı aranıyor...";
    } catch (err) {
        document.getElementById('status').innerText = "Kamera/Mikrofon izni verilmedi.";
    }
}

function skipToNextUser() {
    if(peerConnection) { peerConnection.close(); }
    document.getElementById('remoteVideo').srcObject = null;
    socket.emit('skip-user');
    document.getElementById('status').innerText = "Sıradaki kullanıcıya geçiliyor...";
}

// Mesaj Gönderme
document.getElementById('sendBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text) return;
    
    socket.emit('send-msg', text);
    appendMessage(text, 'me');
    input.value = '';
}

function appendMessage(text, side) {
    const container = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${side}`;
    msgDiv.innerText = text;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// Socket Olayları
socket.on('user-connected', async (data) => {
    document.getElementById('remoteUsername').innerText = data.targetName;
    document.getElementById('status').innerText = "Bağlantı kuruldu!";
    // WebRTC Sinyalleşme adımları server ile koordineli akar...
});