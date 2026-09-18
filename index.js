const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

const PREFIX = "/";
const PHONE_NUMBER = (process.env.PHONE_NUMBER || "").replace(/\D/g, "");
const WARNINGS_FILE = "./warnings.json";
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

if (!PHONE_NUMBER) {
  console.error("❌ Set environment variable PHONE_NUMBER in Railway.");
  process.exit(1);
}

let warnings = {};
if (fs.existsSync(WARNINGS_FILE)) {
  try { warnings = JSON.parse(fs.readFileSync(WARNINGS_FILE, "utf8")); }
  catch { warnings = {}; }
}

function saveWarnings() {
  fs.writeFileSync(WARNINGS_FILE, JSON.stringify(warnings, null, 2));
}

function numberOf(jid = "") {
  return jid.split("@")[0].split(":")[0];
}

function getText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  ).trim();
}

function getMentions(message) {
  return message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

function menuText() {
  return `🤖 *AdminS MENU*

/menu - Tampilkan menu
/ping - Cek bot
/warn @anggota - Beri peringatan
/warnings @anggota - Cek peringatan
/kick @anggota - Keluarkan anggota
/mute on - Tutup chat untuk anggota
/mute off - Buka chat untuk anggota`;
}

async function sendText(sock, jid, text, quoted) {
  return sock.sendMessage(jid, { text }, { quoted });
}

async function isAdmin(sock, groupJid, userJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const participant = metadata.participants.find(p => p.id === userJid);
  return Boolean(participant?.admin);
}

async function botIsAdmin(sock, groupJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const participant = metadata.participants.find(p => p.id === botJid);
  return Boolean(participant?.admin);
}

async function handleCommand(sock, msg, text) {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || jid;
  const [rawCommand, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const command = (rawCommand || "").toLowerCase();

  if (command === "menu") return sendText(sock, jid, menuText(), msg);
  if (command === "ping") return sendText(sock, jid, "🏓 AdminS aktif!", msg);

  if (!jid.endsWith("@g.us")) {
    return sendText(sock, jid, "ℹ️ Fitur admin hanya tersedia di grup.", msg);
  }

  if (!(await isAdmin(sock, jid, sender).catch(() => false))) {
    return sendText(sock, jid, "⛔ Perintah ini khusus admin grup.", msg);
  }

  if (!(await botIsAdmin(sock, jid).catch(() => false))) {
    return sendText(sock, jid, "⚠️ Jadikan AdminS sebagai admin grup terlebih dahulu.", msg);
  }

  const target = getMentions(msg.message)[0];

  if (command === "warn" || command === "warnings") {
    if (!target) return sendText(sock, jid, `Format: /${command} @anggota`, msg);

    warnings[jid] ||= {};
    warnings[jid][target] ||= 0;

    if (command === "warn") {
      warnings[jid][target]++;
      saveWarnings();
    }

    const count = warnings[jid][target];
    return sock.sendMessage(jid, {
      text: command === "warn"
        ? `⚠️ @${numberOf(target)} mendapat peringatan.\nTotal: ${count}`
        : `📋 @${numberOf(target)} memiliki ${count} peringatan.`,
      mentions: [target]
    }, { quoted: msg });
  }

  if (command === "kick") {
    if (!target) return sendText(sock, jid, "Format: /kick @anggota", msg);
    await sock.groupParticipantsUpdate(jid, [target], "remove");

    return sock.sendMessage(jid, {
      text: `👋 @${numberOf(target)} telah dikeluarkan dari grup.`,
      mentions: [target]
    }, { quoted: msg });
  }

  if (command === "mute") {
    const mode = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(mode)) {
      return sendText(sock, jid, "Format: /mute on atau /mute off", msg);
    }

    await sock.groupSettingUpdate(
      jid,
      mode === "on" ? "announcement" : "not_announcement"
    );

    return sendText(
      sock,
      jid,
      mode === "on"
        ? "🔇 Grup sekarang hanya dapat mengirim pesan oleh admin."
        : "🔊 Grup dibuka kembali untuk semua anggota.",
      msg
    );
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on("creds.update", saveCreds);

  if (!state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log(`🔐 KODE PAIRING ADMINs: ${code}`);
        console.log("Buka WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon.");
      } catch (error) {
        console.error("❌ Gagal membuat pairing code:", error);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ AdminS berhasil terhubung.");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("🔄 Koneksi terputus, mencoba lagi...");
        startBot();
      } else {
        console.log("❌ Sesi logout. Hapus folder auth_info lalu login ulang.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const text = getText(msg.message);
    if (!text.startsWith(PREFIX)) return;

    try {
      await handleCommand(sock, msg, text);
    } catch (error) {
      console.error("Command error:", error);
      await sendText(sock, msg.key.remoteJid, "❌ Terjadi kesalahan saat menjalankan perintah.", msg);
    }
  });
}

startBot().catch(console.error);
