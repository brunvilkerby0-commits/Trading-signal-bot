const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Konptè pou jere siyal yo ak jou a
let morningSignalCount = 0;
let eveningSignalCount = 0;
let lastResetDay = -1;

app.get('/', (req, res) => {
    res.send('🤖 Bot Signal k ap kouri nòmalman!');
});

// Fonksyon pou kòmande siyal sou Telegram
async function sendTelegramSignal(pair, action, entryTime) {
    const actionText = action === 'BUY' ? '🟢 BUY / CALL (BOUTON VÈT)' : '🔴 SELL / PUT (BOUTON WOUJ)';
    
    const message = `🚨 <b>SIYAL TEST DEMO (M5)</b>\n\n` +
                    `📊 <b>Pè:</b> ${pair}\n` +
                    `🏦 <b>Platfòm:</b> Pocket Option / Quotex\n` +
                    `🎯 <b>Aksyon:</b> ${actionText}\n` +
                    `⏱️ <b>Echeyans:</b> 5 Minit\n` +
                    `⏰ <b>Lè pou antre:</b> ${entryTime}\n\n` +
                    `⏳ <i>Ou gen 35 segonn pou prepare pè sa a sou kont ou!</i>`;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log(`✅ Siyal voye pou ${pair} - ${action}`);
    } catch (error) {
        console.error('❌ Erè pandan voye siyal Telegram:', error.message);
    }
}

// Fonksyon ki kontwole tan ak kondisyon yo
function checkAndSendSignal() {
    const now = new Date();
    
    // Obteni lè ak jou an tan reyèl pou Haiti / EDT
    const options = { timeZone: 'America/Port-au-Prince', hour12: false };
    const localTimeString = now.toLocaleString('en-US', options);
    const localDate = new Date(localTimeString);

    const dayOfWeek = localDate.getDay(); // 0 = Dimanch, 6 = Samdi
    const localHour = localDate.getHours();
    const currentDay = localDate.getDate();

    // 1. BLOKAJE WIKENN: Si se Samdi (6) oswa Dimanch (0), bot la pa fè anyen
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log('⏸️ Se wikenn (Samdi/Dimanch). Bot la nan poz...');
        return;
    }

    // 2. REYAJISTE KONPTÈ YO CHAK NOUVO JOU
    if (currentDay !== lastResetDay) {
        morningSignalCount = 0;
        eveningSignalCount = 0;
        lastResetDay = currentDay;
        console.log('🔄 Nouvo jou detekte: Konptè siyal yo remèt nan 0.');
    }

    let canSendSignal = false;
    let isMorningSession = false;

    // 3. SESYON MATEN: 9:00 AM rive 12:00 PM (Lè 9, 10, 11) -> Maks 3 siyal
    if (localHour >= 9 && localHour < 12) {
        if (morningSignalCount < 3) {
            canSendSignal = true;
            isMorningSession = true;
        } else {
            console.log('⚠️ Limit 3 siyal maten an deja atenn.');
        }
    } 
    // 4. SESYON ASWÈ: 9:00 PM rive 12:00 AM (Lè 21, 22, 23) -> Maks 3 siyal
    else if (localHour >= 21 && localHour < 24) {
        if (eveningSignalCount < 3) {
            canSendSignal = true;
            isMorningSession = false;
        } else {
            console.log('⚠️ Limit 3 siyal aswè a deja atenn.');
        }
    } else {
        console.log('⏳ Deyò fenèt lè siyal yo (Mat: 9h-12h | Aswè: 21h-24h). Bot la ap tann...');
        return;
    }

    if (!canSendSignal) return;

    // --- ENTEGRE LOJIK ENDIKATÈ OU YO (RSI / SMA) LA A ---
    // Egzanp Lojik Siyal:
    const pairs = ['EUR/USD', 'GBP/USD'];
    const selectedPair = pairs[Math.floor(Math.random() * pairs.length)];
    const action = Math.random() > 0.5 ? 'BUY' : 'SELL';

    // Kalkile Lè pou antre a (+35 segonn pou antre sou pwochen bouji)
    const entryDate = new Date(localDate.getTime() + 35 * 1000);
    const entryTime = entryDate.toTimeString().split(' ')[0] + ' PM';

    // Voye Siyal la
    sendTelegramSignal(selectedPair, action, entryTime);

    // Ogmante konptè sesyon an
    if (isMorningSession) {
        morningSignalCount++;
        console.log(`📈 Siyal Maten voye (${morningSignalCount}/3)`);
    } else {
        eveningSignalCount++;
        console.log(`📈 Siyal Aswè voye (${eveningSignalCount}/3)`);
    }
}

// Verifye mache a chak 5 minit
setInterval(checkAndSendSignal, 5 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Sèvè ap kouri sou pòt ${PORT}`);
});
