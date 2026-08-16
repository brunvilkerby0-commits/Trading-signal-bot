const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');

const app = express(); 
const PORT = process.env.PORT || 3000;

// 🔐 Konfigirasyon Telegram ak Deriv
const TELEGRAM_BOT_TOKEN = "8875684135:AAFPGkJKDnxTzNGdH7rIfqzwyofy40cB3Ek"; 
const TELEGRAM_CHAT_ID = "@smartasset_vip_signal"; 
const DERIV_API_TOKEN = "Pat_38421a47ffaba53af534682d52a3c9558a3c8f224f8f68092fcdd075fb8f7192";
const DERIV_APP_ID = "1089"; // Standard App ID pou Deriv WebSocket

// 📊 Paramèt Jesyon Ris
const STAKE_AMOUNT = 1;      // Risk $1 sou chak trade
const TARGET_PROFIT = 10;   // Sispann lè w fè +$10
const STOP_LOSS = 7;        // Sispann lè w pèdi -$7

let totalProfitLoss = 0;
let isTradingActive = true;
let ws = null;

app.get('/', (req, res) => {
    res.status(200).send('Robo Trading Deriv ap Kouri!');
});

// Fonksyon pou voye mizajou sou Telegram
async function sendTelegramMessage(msg) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: msg,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.error('Erè voye mesaj Telegram:', err.message);
    }
}

// 🔌 Koneksyon WebSocket ak Deriv
function connectDeriv() {
    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);

    ws.on('open', () => {
        console.log('✅ Konekte ak Sèvè Deriv!');
        // Otonitfike kont lan ak API Token an
        ws.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
    });

    ws.on('message', (data) => {
        const response = JSON.parse(data);

        // 1. Apwobasyon Otonitfikasyon Kont
        if (response.msg_type === 'authorize') {
            if (response.error) {
                console.error('❌ Erè Otonitfikasyon Deriv:', response.error.message);
                return;
            }
            console.log(`🤖 Kont Deriv rekonèt! Solde: ${response.authorize.balance} ${response.authorize.currency}`);
            sendTelegramMessage(`🤖 <b>SMARTASSET BOT KONEKTE SOU DERIV</b>\n\n💰 Solde Kont: <b>$${response.authorize.balance}</b>\n🎯 Objektif Benefis: <b>+$${TARGET_PROFIT}</b>\n🛑 Stop Loss: <b>-$${STOP_LOSS}</b>`);
            
            // Reledemare analiz ak tès mache a
            startMarketAnalysis();
        }

        // 2. Repons lè yon Trade pase
        if (response.msg_type === 'buy') {
            if (response.error) {
                console.error('❌ Erè Achte Kontra:', response.error.message);
            } else {
                console.log('🚀 Trade Otomatik Rantre kòrèkteman!', response.buy.contract_id);
                sendTelegramMessage(`⚡ <b>TRADE ANKOURI SOU DERIV!</b>\n\n💵 Miz: <b>$${STAKE_AMOUNT}</b>\n🆔 Kontra: ${response.buy.contract_id}`);
                
                // Souflete rezilta kontra a
                ws.send(JSON.stringify({
                    proposal_open_contract: 1,
                    contract_id: response.buy.contract_id,
                    subscribe: 1
                }));
            }
        }

        // 3. Suivi ak Fermeture Trade la nan Moman Benefis/Pèt
        if (response.msg_type === 'proposal_open_contract') {
            const contract = response.proposal_open_contract;
            if (contract.is_sold) {
                const profit = parseFloat(contract.profit);
                totalProfitLoss += profit;

                const resultSymbol = profit >= 0 ? '✅ WIN' : '❌ LOSS';
                sendTelegramMessage(`📊 <b>REZILTA TRADE: ${resultSymbol}</b>\n\n💵 Profit/Pèt Trade sa a: <b>$${profit.toFixed(2)}</b>\n📈 PnL Akimile: <b>$${totalProfitLoss.toFixed(2)}</b>`);

                // Tcheke Jesyon Ris
                if (totalProfitLoss >= TARGET_PROFIT) {
                    isTradingActive = false;
                    sendTelegramMessage(`🎉 <b>OBJEKTIF ATENN!</b>\n\nBot la fè <b>+$${totalProfitLoss.toFixed(2)}</b> benefis jodi a. Li sispann kouri pou proteje gany ou!`);
                } else if (totalProfitLoss <= -STOP_LOSS) {
                    isTradingActive = false;
                    sendTelegramMessage(`🛑 <b>STOP LOSS HIT!</b>\n\nBot la touché limit pèt (-$${Math.abs(totalProfitLoss).toFixed(2)}). Li sispann kouri pou proteje kapital ou.`);
                }
            }
        }
    });

    ws.on('close', () => {
        console.log('🔌 Koneksyon Deriv koupe. Re-konekte nan 5 segonn...');
        setTimeout(connectDeriv, 5000);
    });

    ws.on('error', (err) => {
        console.error('Erè WebSocket:', err.message);
    });
}

// 🧠 SÈVO ROBOT TRADING DERIV
function startMarketAnalysis() {
    setInterval(() => {
        if (!isTradingActive) return;

        // Tcheke ak rantre yon trade sou pè Volatility 100 Index (5 Ticks / 5 Segonn)
        ws.send(JSON.stringify({
            amount: STAKE_AMOUNT,
            basis: 'stake',
            contract_type: Math.random() > 0.5 ? 'CALL' : 'PUT', // Analiz estrateji kòmand
            currency: 'USD',
            duration: 5,
            duration_unit: 't',
            symbol: 'R_100'
        }));

        ws.once('message', (data) => {
            const res = JSON.parse(data);
            if (res.msg_type === 'proposal' && res.proposal) {
                // Ekzekite achte otomatik kont la!
                ws.send(JSON.stringify({
                    buy: res.proposal.id,
                    price: STAKE_AMOUNT
                }));
            }
        });

    }, 30 * 1000); // Rantre yon trade chak 30 segonn depi gen okazi
}

// Emèt koneksyon an
connectDeriv();

app.listen(PORT, () => {
    console.log(`🚀 Sèvè ap kouri sou pòt ${PORT}`);
});
