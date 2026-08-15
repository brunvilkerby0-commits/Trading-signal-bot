const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// 🔐 Konfigirasyon Telegram ak API Key Twelve Data
const TELEGRAM_BOT_TOKEN = "8875684135:AAFPGkJKDnxTzNGdH7rIfqzwyofy40cB3Ek"; 
const TELEGRAM_CHAT_ID = "@smartasset_vip_signal"; 
const TWELVE_DATA_API_KEY = "4f982e823b3646cc96a5c9db44bf53fd";

// Ti repons kout pou Cron-job.org
app.get('/', (req, res) => {
    res.status(200).send('OK');
});

// Fonksyon pou voye siyal sou Telegram
async function sendTelegramSignal(pair, action, entryTime, rsiVal) {
    const actionText = action === 'BUY' ? '🟢 BUY / CALL (BOUTON VÈT)' : '🔴 SELL / PUT (BOUTON WOUJ)';
    
    const message = `🚨 <b>VIP ACCURATE SIGNAL (M5)</b>\n\n` +
                    `📊 <b>Pè:</b> ${pair}\n` +
                    `🏦 <b>Platfòm:</b> Pocket Option / Quotex\n` +
                    `🎯 <b>Aksyon:</b> ${actionText}\n` +
                    `⏱️ <b>Echeyans:</b> 5 Minit\n` +
                    `⏰ <b>Lè pou antre:</b> ${entryTime}\n` +
                    `📈 <b>Vrè RSI (14):</b> ${rsiVal}\n\n` +
                    `⏳ <i>Ou gen 35 segonn pou prepare pè sa a sou kont ou!</i>`;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log(`✅ Siyal voye pou ${pair} - ${action} (RSI: ${rsiVal})`);
    } catch (error) {
        console.error('❌ Erè pandan voye siyal Telegram:', error.response ? error.response.data : error.message);
    }
}

// 🧠 SÈVO TRADER: Analyse done an tan reyèl ak Twelve Data API
async function fetchMarketAnalysis(symbol) {
    try {
        const url = `https://api.twelvedata.com/rsi?symbol=${symbol}&interval=5min&time_period=14&apikey=${TWELVE_DATA_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.values && response.data.values.length > 0) {
            const latestRSI = parseFloat(response.data.values[0].rsi).toFixed(2);
            
            let action = null;
            // Si RSI <= 45 nou BUY, si RSI >= 55 nou SELL pou tès la ka jwenn siyal pi rapid
            if (latestRSI <= 50) {
                action = 'BUY';
            } else {
                action = 'SELL';
            }
            
            return { action, rsi: latestRSI };
        }
    } catch (err) {
        console.error(`Erè pandan rale done pou ${symbol}:`, err.message);
    }
    return null;
}

async function checkAndSendSignal() {
    const now = new Date();
    const haitiTimeString = now.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" });
    const haitiDate = new Date(haitiTimeString);

    // Lis pè prensipal yo
    const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];
    
    // Nou chwazi yon pè pou fè analiz la ak voye siyal la kounye a
    const selectedPair = pairs[Math.floor(Math.random() * pairs.length)];
    const analysis = await fetchMarketAnalysis(selectedPair);
    
    if (analysis && analysis.action) {
        // Kalkile lè antre a (+35 segonn) pou fòma 12h Ayiti
        const entryDate = new Date(haitiDate.getTime() + 35 * 1000);
        const entryTimeFormatted = entryDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // Voye Siyal la
        await sendTelegramSignal(selectedPair, analysis.action, entryTimeFormatted, analysis.rsi);
    }
}

// Kouri yon premye fwa touswit lè sèvè a dèmare
checkAndSendSignal();

// Kontinye verifye mache a chak 5 minit
setInterval(checkAndSendSignal, 5 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Sèvè ap kouri sou pòt ${PORT}`);
});
