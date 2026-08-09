const express = require('express');
const axios = require('axios');

// ==========================================
// 🌐 SÈVÈ HTTP POU KEEP-ALIVE SOU RENDER
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('<h2>🤖 Telegram Trading Bot an kouri avèk siksè!</h2>');
});

app.listen(PORT, () => {
    console.log(`Sèvè kouri sou pò ${PORT}`);
});

// ==========================================
// ⚙️ KONFIGIRASYON TELEGRAM AK API
// ==========================================
const TELEGRAM_BOT_TOKEN = '8875684135:AAFPGkJKDnxTzNGdH7rIfqzwyofy40cB3Ek';
const TELEGRAM_CHAT_ID = '@smartasset_vip_signal'; 

const TWELVE_DATA_API_KEY = '19666d2118134083916f74bed6fc6e10';

// ==========================================
// 📩 FUNKSYON POU VOYE MESAJ SOU TELEGRAM
// ==========================================
async function voyeMesajTelegram(mesaj) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: mesaj,
            parse_mode: 'Markdown'
        });
        console.log('✅ Siyal voye sou Telegram avèk siksè!');
    } catch (error) {
        console.error('Erè pandan voye mesaj Telegram:', error.response?.data || error.message);
    }
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
function demareMinitye() {
    console.log('🤖 Robot Telegram an kòmanse siveye mache a...');
    setInterval(async () => {
        const kounyea = new Date();
        const minit = kounyea.getMinutes();
        const segonn = kounyea.getSeconds();

        if (minit % 5 === 4 && segonn === 50) {
            const forexPairs = ['EUR/USD', 'GBP/USD'];
            const cryptoPairs = ['BTCUSDT', 'ETHUSDT'];

            for (let pair of forexPairs) {
                const signal = await analizeForex(pair);
                if (signal) await prepareEpiVoye(pair, signal);
            }

            for (let pair of cryptoPairs) {
                const displayPair = pair.replace('USDT', '/USDT');
                const signal = await analizeCrypto(pair);
                if (signal) await prepareEpiVoye(displayPair, signal);
            }
        }
    }, 1000);
}

async function prepareEpiVoye(symbol, aksyon) {
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

    await voyeMesajTelegram(mesaj);
}

demareMinitye();
