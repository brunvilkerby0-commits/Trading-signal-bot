const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

// ==========================================
// 🌐 TÌ SÈVÈ HTTP POU RENDER (PÒ 10000)
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Robot Trading la ap kouri san pwoblèm!');
});
app.listen(PORT, () => {
    console.log(`Sèvè ap koute sou pò ${PORT}`);
});

// ==========================================
// ⚙️ KONFIGIRASYON
// ==========================================
const TWELVE_DATA_API_KEY = '19666d2118134083916f74bed6fc6e10';
const TARGET_GROUP_NAME = 'VIP trading'; // Non gwoup WhatsApp ou a

async function demareBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📲 Scan kòd QR sa a ak WhatsApp ou:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksyon mouri, ap redemare...', shouldReconnect);
            if (shouldReconnect) demareBot();
        } else if (connection === 'open') {
            console.log('🤖 Robot VIP Trading la konekte sou WhatsApp avèk siksè!');
            demareMinitye(sock);
        }
    });
}

// ==========================================
// 🧠 SÈVO ANALIZ (FOREX & CRYPTO)
// ==========================================
async function analizeForex(symbol) {
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=5min&outputsize=20&apikey=${TWELVE_DATA_API_KEY}`;
        const res = await axios.get(url);
        const data = res.data.values;
        if (!data || data.length < 15) return null;
        const closes = data.map(c => parseFloat(c.close)).reverse();
        return meganismSevo(closes);
    } catch (e) {
        return null;
    }
}

async function analizeCrypto(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=20`;
        const res = await axios.get(url);
        const data = res.data;
        if (!data || data.length < 15) return null;
        const closes = data.map(c => parseFloat(c[4]));
        return meganismSevo(closes);
    } catch (e) {
        return null;
    }
}

function meganismSevo(closes) {
    const len = closes.length;
    const currentClose = closes[len - 1];
    const sma10 = closes.slice(len - 10).reduce((a, b) => a + b, 0) / 10;

    let gains = 0, losses = 0;
    for (let i = len - 14; i < len; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    if (currentClose > sma10 && rsi > 52 && rsi < 70) return 'BUY';
    if (currentClose < sma10 && rsi < 48 && rsi > 30) return 'SELL';
    return null;
}

// ==========================================
// ⏱️ MINITYE BOUJI M5 (4m50s)
// ==========================================
function demareMinitye(sock) {
    setInterval(async () => {
        const kounyea = new Date();
        const minit = kounyea.getMinutes();
        const segonn = kounyea.getSeconds();

        if (minit % 5 === 4 && segonn === 50) {
            const forexPairs = ['EUR/USD', 'GBP/USD'];
            const cryptoPairs = ['BTCUSDT', 'ETHUSDT'];

            for (let pair of forexPairs) {
                const signal = await analizeForex(pair);
                if (signal) await voyeSiyal(sock, pair, signal);
            }

            for (let pair of cryptoPairs) {
                const displayPair = pair.replace('USDT', '/USDT');
                const signal = await analizeCrypto(pair);
                if (signal) await voyeSiyal(sock, displayPair, signal);
            }
        }
    }, 1000);
}

// ==========================================
// 📩 PIBLIKASYON SOU GWOUP WHATSAPP
// ==========================================
async function voyeSiyal(sock, symbol, aksyon) {
    try {
        const groups = await sock.groupFetchAllParticipating();
        let targetGroupJid = null;

        for (const jid in groups) {
            if (groups[jid].subject === TARGET_GROUP_NAME) {
                targetGroupJid = jid;
                break;
            }
        }

        if (!targetGroupJid) {
            console.log(`⚠️ Gwoup "${TARGET_GROUP_NAME}" pa jwenn sou WhatsApp!`);
            return;
        }

        const antreDate = new Date(Date.now() + 10000);
        const lèFormate = antreDate.toTimeString().split(' ')[0];
        const ikon = aksyon === 'BUY' ? '🟢 BUY / CALL (BOUTON VÈ)' : '🔴 SELL / PUT (BOUTON WOUJ)';

        const mesaj = `🚨 *SIYAL TEST DEMO (M5)*\n\n` +
                      `📊 *Pè:* ${symbol}\n` +
                      `🏦 *Platfòm:* Pocket Option\n` +
                      `🎯 *Aksyon:* ${ikon}\n` +
                      `⏱️ *Echeyans:* 5 Minit\n` +
                      `⏰ *Lè pou antre:* ${lèFormate}\n\n` +
                      `💡 _Prepare pè sa a kounye a sou kont DEMO!_`;

        await sock.sendMessage(targetGroupJid, { text: mesaj });
        console.log(`✅ Siyal voye sou gwoup WhatsApp pou ${symbol}!`);
    } catch (e) {
        console.error('Erè pandan voye mesaj:', e.message);
    }
}

demareBot();
