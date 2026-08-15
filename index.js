const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// 🔐 Konfigirasyon Telegram ak API Key Twelve Data
const TELEGRAM_BOT_TOKEN = "8875684135:AAFPGkJKDnxTzNGdH7rIfqzwyofy40cB3Ek"; 
const TELEGRAM_CHAT_ID = "@smartasset_vip_signal"; 
const TWELVE_DATA_API_KEY = "4f982e823b3646cc96a5c9db44bf53fd";

let morningSignalCount = 0;
let eveningSignalCount = 0;
let lastResetDay = -1;

// Repons kout pou Cron-job.org pa janm bloke
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
            // Vrè analiz trader: Sèlman lè RSI antre nan zòn ekstrèm
            if (latestRSI <= 38) {
                action = 'BUY'; 
            } else if (latestRSI >= 62) {
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

    const dayOfWeek = haitiDate.getDay(); 
    const localHour = haitiDate.getHours();
    const currentDay = haitiDate.getDate();

    // 1. Bloke Wikenn (Samdi / Dimanch)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log('⏸️ Se wikenn. Bot la nan poz...');
        return;
    }

    // 2. Reyajiste konptè chak jou
    if (currentDay !== lastResetDay) {
        morningSignalCount = 0;
        eveningSignalCount = 0;
        lastResetDay = currentDay;
        console.log('🔄 Nouvo jou: Konptè yo retounen nan 0.');
    }

    let canSendSignal = false;
    let isMorningSession = false;

    // Sesyon Maten (9 AM - 12 PM) -> Max 3 siyal
    if (localHour >= 9 && localHour < 12) {
        if (morningSignalCount < 3) {
            canSendSignal = true;
            isMorningSession = true;
        }
    } 
    // Sesyon Aswè (9 PM - 12 AM) -> Max 3 siyal
    else if (localHour >= 21 && localHour < 24) {
        if (eveningSignalCount < 3) {
            canSendSignal = true;
            isMorningSession = false;
        }
    } else {
        console.log('⏳ Deyò fenèt lè siyal yo. Bot la ap tann...');
        return;
    }

    if (!canSendSignal) return;

    // Lis pè prensipal yo pou analize sou chak bouji M5
    const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];
    
    for (let pair of pairs) {
        const analysis = await fetchMarketAnalysis(pair);
        
        if (analysis && analysis.action) {
            const entryDate = new Date(haitiDate.getTime() + 35 * 1000);
            const entryTimeFormatted = entryDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            await sendTelegramSignal(pair, analysis.action, entryTimeFormatted, analysis.rsi);

            if (isMorningSession) {
                morningSignalCount++;
                console.log(`📈 Siyal Maten voye (${morningSignalCount}/3)`);
            } else {
                eveningSignalCount++;
                console.log(`📈 Siyal Aswè voye (${eveningSignalCount}/3)`);
            }
            break; 
        }
    }
}

// Analize ak kontwole mache a presizeman sou chak kadans bouji 5 minit
setInterval(checkAndSendSignal, 5 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Sèvè ap kouri sou pòt ${PORT}`);
});
