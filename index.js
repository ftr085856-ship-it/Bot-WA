const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const http = require('http');

// Nomor HP lu udah langsung terpasang!
const NOMOR_HP_LU = "6285745490918"; 

// 1. HTTP Server mini penahan Railway (Biar Gak Auto-Kill Container)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WA GOG Online! 🗿🥀');
}).listen(PORT, () => {
    console.log(`Server Web Health-Check jalan di port ${PORT}`);
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_wa');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    let codeRequested = false;

    // 2. Monitor Status Koneksi Server & Request Kode Pairing
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if ((connection === 'connecting' || connection === 'open') && !sock.authState.creds.registered && !codeRequested) {
            codeRequested = true;
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(NOMOR_HP_LU);
                    console.log(`\n=================================`);
                    console.log(`👉 KODE PAIRING LU: ${code}`);
                    console.log(`=================================\n`);
                } catch (err) {
                    console.log("Koneksi belum siap, mencoba lagi...", err?.message || err);
                    codeRequested = false;
                }
            }, 3000);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus! Reconnecting...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('🚀 BOT WHATSAPP GOG BERHASIL KONEK DAN ONLINE!');
        }
    });

    // 3. Logika Pesan Masuk di Grup
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const chatJid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (chatJid.endsWith('@g.us')) {
            if (text.toLowerCase() === '!gog') {
                await sock.sendMessage(chatJid, { text: 'Bot Anomaly GOG Siap Melayani Gabutnya Lu Pada! 🗿🥀' });
            }
            if (text.toLowerCase() === 'ping') {
                await sock.sendMessage(chatJid, { text: 'Pong! 🗿🔥' });
            }
        }
    });
}

startBot();
