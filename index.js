const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

// ============================================================
// MASUKKAN NOMOR HP LU DI SINI (Format: 628xxxxxxxxxx)
// ============================================================
const NOMOR_HP_LU = "6285745490918"; 

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_wa');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    let codeRequested = false;

    // Monitor Status Koneksi Server
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // Hanya minta kode pairing KALAU socket sudah siap & belum terdaftar
        if ((connection === 'connecting' || connection === 'open') && !sock.authState.creds.registered && !codeRequested) {
            codeRequested = true;
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(NOMOR_HP_LU);
                    console.log(`\n=================================`);
                    console.log(`👉 KODE PAIRING BARU LU: ${code}`);
                    console.log(`=================================\n`);
                } catch (err) {
                    console.log("Koneksi belum stabil, bakal nyoba lagi...", err?.message || err);
                    codeRequested = false; // Reset biar bisa minta ulang kalau gagal
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

    // Logika Bales Chat di Grup
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return; // Bisa dites pakai akun sendiri

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
