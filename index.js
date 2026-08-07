const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// ==========================================
// ⚙️ KONFIGIRASYON WOBO A
// ==========================================
const TWELVE_DATA_API_KEY = '19666d2118134083916f74bed6fc6e10';
const TARGET_GROUP_NAME = 'VIP trading'; // Non gwoup WhatsApp ou a

// Inicializasyon Client WhatsApp ak konfigirasyon pou sèvè Linux (Render)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('📲 Scan kòd QR sa a ak WhatsApp ou:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('🤖 Sèvo Robot VIP Trading la PARE pou tès sou Demo!');
    demareMinitye();
});

// ==========================================
// 🧠 SÈVO ANALIZ (FOREX & CRYPTO)
// ==========================================

// 1. Analiz Forex (Twelve Data)
async function analizeForex(symbol) {
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=5min&outputsize=20&apikey=${TWELVE_DATA_API_KEY}`;
        const res = await axios.get(url);
        const data = res.data.values;

        if (!data || data.length < 15) return null;

        // Pri cloti yo (soti nan pi resan pou rive nan pi ansyen)
        const closes = data.map(c => parseFloat(c.close)).reverse();
        
        return meganismSevo(closes);
    } catch (e) {
        console.error(`Erè Forex (${symbol}):`, e.message);
        return null;
    }
}

// 2. Analiz Crypto (Binance - Gratis san API key)
async function analizeCrypto(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=20`;
        const res = await axios.get(url);
        const data = res.data;

        if (!data || data.length < 15) return null;

        // Index 4 reprezante pri cloti bouji an
        const closes = data.map(c => parseFloat(c[4]));

        return meganismSevo(closes);
    } catch (e) {
        console.error(`Erè Crypto (${symbol}):`, e.message);
        return null;
    }
}

// 3. Algorit Analiz Teknik (RSI + Moving Average)
function meganismSevo(closes) {
    const len = closes.length;
    const currentClose = closes[len - 1];

    // Simple Moving Average (SMA 10)
    const sma10 = closes.slice(len - 10).reduce((a, b) => a + b, 0) / 10;

    // Relative Strength Index (RSI 14)
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

    // Lojik Filtre Siyal Strik
    if (currentClose > sma10 && rsi > 52 && rsi < 70) {
        return 'BUY';
    } else if (currentClose < sma10 && rsi < 48 && rsi > 30) {
        return 'SELL';
    }

    return null; // Mache an pa ba yon bon konfimasyon
}

// ==========================================
// ⏱️ MINITYE BOUJI M5 (4m50s)
// ==========================================
function demareMinitye() {
    setInterval(async () => {
        const kounyea = new Date();
        const minit = kounyea.getMinutes();
        const segonn = kounyea.getSeconds();

        // Voye siyal egzakteman nan 4yèm minit ak 50yèm segonn
        if (minit % 5 === 4 && segonn === 50) {
            console.log('🔍 Sèvo an ap filtre mache a...');

            // Lis Pè Forex ak Crypto high-payout
            const forexPairs = ['EUR/USD', 'GBP/USD'];
            const cryptoPairs = ['BTCUSDT', 'ETHUSDT'];

            // Analize Forex
            for (let pair of forexPairs) {
                const signal = await analizeForex(pair);
                if (signal) await voyeSiyal(pair, signal);
            }

            // Analize Crypto
            for (let pair of cryptoPairs) {
                const displayPair = pair.replace('USDT', '/USDT');
                const signal = await analizeCrypto(pair);
                if (signal) await voyeSiyal(displayPair, signal);
            }
        }
    }, 1000);
}

// ==========================================
// 📩 PIBLIKASYON SIYAL SOU WHATSAPP
// ==========================================
async function voyeSiyal(symbol, aksyon) {
    const chats = await client.getChats();
    const group = chats.find(chat => chat.isGroup && chat.name === TARGET_GROUP_NAME);

    if (!group) {
        console.log(`⚠️ Gwoup "${TARGET_GROUP_NAME}" pa jwenn! Check non an sou WhatsApp.`);
        return;
    }

    // Kalkile lè pou antre (lè bouji an ap kòmanse)
    const antreDate = new Date(Date.now() + 10000);
    const lèFormate = antreDate.toTimeString().split(' ')[0];
    const ikon = aksyon === 'BUY' ? '🟢 BUY / CALL (BOUTON VÈ)' : '🔴 SELL / PUT (BOUTON WOUJ)';

    const mesaj = `🚨 **SIYAL TEST DEMO (M5)**\n\n` +
                  `📊 **Pè:** ${symbol}\n` +
                  `🏦 **Platfòm:** Pocket Option\n` +
                  `🎯 **Aksyon:** ${ikon}\n` +
                  `⏱️ **Echeyans:** 5 Minit\n` +
                  `⏰ **Lè pou antre:** ${lèFormate}\n\n` +
                  `💡 *Prepare pè sa a kounye a sou kont DEMO epi antre nan minit presi sa a!*`;

    await group.sendMessage(mesaj);
    console.log(`✅ Siyal voye sou ${TARGET_GROUP_NAME} pou ${symbol}!`);
}

client.initialize();
