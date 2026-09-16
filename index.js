const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

// ============================================================
// UBAH NOMOR DI BAWAH INI SESUAI NOMOR WHATSAPP LU
// Format: Gunakan kode negara tanpa tanda +, misal: 6281234567890
// ============================================================
const NOMOR_HP_LU = "628xxxxxxxxxx"; 

async function startBot() {
    // 1. Simpan sesi di folder 'session_wa' agar tidak usah pairing ulang saat server restart
    const { state, saveCreds } = await useMultiFileAuthState('session_wa');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Matikan QR Code
    });

    sock.ev.on('creds.update', saveCreds);

    // 2. Minta Kode Pairing jika akun belum terhubung
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NOMOR_HP_LU);
                console.log(`\n=================================`);
                console.log(`👉 KODE PAIRING LU: ${code}`);
                console.log(`=================================\n`);
            } catch (err) {
                console.log("Gagal meminta kode pairing:", err);
            }
        }, 4000);
    }

    // 3. Monitor Status Koneksi Server
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus! Reconnecting...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('🚀 BOT WHATSAPP GOG BERHASIL KONEK DAN ONLINE!');
        }
    });

    // 4. Logika Bales Chat di Grup
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const chatJid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        // Hanya merespon jika pesan masuk dari GRUP
        if (chatJid.endsWith('@g.us')) {
            // Contoh Perintah 1: !gog
            if (text.toLowerCase() === '!gog') {
                await sock.sendMessage(chatJid, { text: 'Bot Anomaly GOG Siap Melayani Gabutnya Lu Pada! 🗿🥀' });
            }
            // Contoh Perintah 2: ping
            if (text.toLowerCase() === 'ping') {
                await sock.sendMessage(chatJid, { text: 'Pong! 🗿🔥' });
            }
        }
    });
}

// Jalankan Bot
startBot();