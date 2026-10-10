const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || "4f982e823b3646cc96a5c9db44bf53fd";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8875684135:AAFPGkJKDnxTzNGdH7rIfqzwyofy40cB3Ek";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@smartasset_vip_signal";

// LYEN YO
const APK_DOWNLOAD_URL = "https://pocketoption.com";
const TELEGRAM_GROUP_URL = "https://t.me/smartasset_vip_signal";
const REGISTER_URL = "https://pocketoption.com";

const PAIRS = ["EUR/USD", "GBP/USD", "USD/CAD", "AUD/USD", "EUR/JPY"];
const INTERVAL = "5min";
const MIN_SCORE = 65;

// Orè travay (Ayiti)
const START_HOUR = 8;
const END_HOUR = 10;

let lastSignalKey = "";
let lastAnalysisSlot = "";
let currentDayKey = "";
let openedToday = false;
let closedToday = false;
let warnedToday = false;
let schedulerBusy = false;

app.get("/", (req, res) => {
  res.status(200).send("SMARTASSET Pocket Option Signal Bot ap kouri.");
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHaitiDate() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Port-au-Prince",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p => [p.type, p.value]));
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    dayOfWeek: days[parts.weekday]
  };
}

async function sendTelegram(message, inlineButtons = null) {
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (inlineButtons) payload.reply_markup = { inline_keyboard: inlineButtons };

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      payload,
      { timeout: 10000 }
    );
    console.log("Telegram message voye kòrèkteman.");
  } catch (error) {
    console.error("Telegram error:", error.response?.data || error.message);
  }
}

async function getCandles(symbol, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get("https://api.twelvedata.com/time_series", {
        params: {
          symbol,
          interval: INTERVAL,
          outputsize: 150,
          order: "ASC",
          timezone: "UTC",
          apikey: TWELVE_DATA_API_KEY
        },
        timeout: 15000
      });

      if (response.data.status === "error") throw new Error(response.data.message);
      if (!response.data.values || response.data.values.length < 60) {
        throw new Error(`Pa gen ase candles pou ${symbol}.`);
      }

      return response.data.values.map(c => ({
        time: c.datetime,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      }));
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000);
    }
  }
}

function calculateEMAArray(values, period) {
  if (values.length < period) return [];
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = new Array(period - 1).fill(null);
  result.push(current);
  for (let i = period; i < values.length; i++) {
    current = (values[i] - current) * multiplier + current;
    result.push(current);
  }
  return result;
}

function ema(values, period) {
  const arr = calculateEMAArray(values, period);
  return arr.length ? arr[arr.length - 1] : null;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calculateMACD(values) {
  const fast = calculateEMAArray(values, 12);
  const slow = calculateEMAArray(values, 26);
  const macd = [];
  for (let i = 0; i < values.length; i++) {
    if (fast[i] == null || slow[i] == null) macd.push(null);
    else macd.push(fast[i] - slow[i]);
  }
  const validMACD = macd.filter(v => v !== null);
  if (validMACD.length < 9) return null;
  const signalArray = calculateEMAArray(validMACD, 9);
  const lastMACD = validMACD[validMACD.length - 1];
  const lastSignal = signalArray[signalArray.length - 1];
  if (lastSignal == null) return null;
  return {
    macd: lastMACD,
    signal: lastSignal,
    bullish: lastMACD > lastSignal,
    bearish: lastMACD < lastSignal
  };
}

function candleDirection(candle) {
  if (candle.close > candle.open) return "bullish";
  if (candle.close < candle.open) return "bearish";
  return "neutral";
}

function analyze(candles) {
  const closes = candles.map(c => c.close);
  const last = candles[candles.length - 1];

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsiValue = rsi(closes, 14);
  const macd = calculateMACD(closes);

  if (ema9 == null || ema21 == null || ema50 == null || rsiValue == null || !macd) return null;

  let callScore = 0, putScore = 0;
  const reasonsCall = [], reasonsPut = [];

  if (rsiValue <= 42) { callScore += 30; reasonsCall.push(`RSI Oversold (${rsiValue.toFixed(1)})`); }
  if (rsiValue >= 58) { putScore += 30; reasonsPut.push(`RSI Overbought (${rsiValue.toFixed(1)})`); }

  if (ema9 > ema21) { callScore += 25; reasonsCall.push("Tandans Acha (EMA 9 > 21)"); }
  if (ema9 < ema21) { putScore += 25; reasonsPut.push("Tandans Vant (EMA 9 < 21)"); }

  if (macd.bullish) { callScore += 25; reasonsCall.push("MACD Bullish"); }
  if (macd.bearish) { putScore += 25; reasonsPut.push("MACD Bearish"); }

  const dir = candleDirection(last);
  if (dir === "bullish") { callScore += 20; reasonsCall.push("Dènye bouji a bullish"); }
  if (dir === "bearish") { putScore += 20; reasonsPut.push("Dènye bouji a bearish"); }

  let direction = null, score = 0, reasons = [];

  // Filtè RSI
  if (callScore >= MIN_SCORE && callScore > putScore && rsiValue < 70) {
    direction = "CALL"; score = callScore; reasons = reasonsCall;
  } else if (putScore >= MIN_SCORE && putScore > callScore && rsiValue > 30) {
    direction = "PUT"; score = putScore; reasons = reasonsPut;
  }

  return { direction, score, reasons, rsi: rsiValue, lastCandle: last };
}

function getNextEntryTime() {
  const next = new Date();
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(Math.floor(next.getUTCMinutes() / 5) * 5 + 5);
  return next;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Port-au-Prince",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

async function analyzeAllPairsAndSendBest() {
  let bestSignal = null;

  for (const pair of PAIRS) {
    try {
      const candles = await getCandles(pair);
      const analysis = analyze(candles);

      if (analysis && analysis.direction && analysis.score >= MIN_SCORE) {
        if (!bestSignal || analysis.score > bestSignal.analysis.score) {
          bestSignal = { symbol: pair, analysis };
        }
      }
    } catch (error) {
      console.error(`${pair} analysis error:`, error.message);
    }
    await sleep(400);
  }

  if (!bestSignal) {
    console.log(`Pa gen okenn siyal ki atenn ${MIN_SCORE}/100.`);
    return;
  }

  const { symbol, analysis } = bestSignal;
  const entry = getNextEntryTime();
  const exit = new Date(entry.getTime() + 5 * 60 * 1000);
  const signalKey = `${symbol}-${entry.toISOString()}-${analysis.direction}`;

  if (signalKey === lastSignalKey) return;
  lastSignalKey = signalKey;

  // TANN PRESİZEMAN 30 SEGONN ANVAN BOUJI A KÒMANSE POU VOYE
  const waitMs = entry.getTime() - 30000 - Date.now();
  if (waitMs > 0) await sleep(waitMs);

  const emoji = analysis.direction === "CALL" ? "🟢" : "🔴";
  const action = analysis.direction === "CALL" ? "CALL / BUY (MONTE)" : "PUT / SELL (DESANN)";

  const message =
    `🚨 <b>SMARTASSET POCKET OPTION SIGNAL</b>\n\n` +
    `💱 <b>PAIR:</b> ${symbol}\n` +
    `${emoji} <b>DIRECTION:</b> ${action}\n\n` +
    `⏰ <b>ENTRY TIME:</b> ${formatTime(entry)}\n` +
    `⌛ <b>EXPIRY:</b> 5 MINUTES\n` +
    `🏁 <b>CLOSE TIME:</b> ${formatTime(exit)}\n\n` +
    `🎯 <b>SCORE:</b> ${analysis.score}/100\n` +
    `📈 <b>RSI:</b> ${analysis.rsi.toFixed(1)}\n\n` +
    `📊 <b>REASONS:</b>\n` +
    `${analysis.reasons.map(x => `• ${x}`).join("\n")}\n\n` +
    `⚡ <i>PREPARE W POU W ANTRE NAN LÈ SAK MAKE ANLÈ A!</i>`;

  const buttons = [
    [
      { text: "📲 Telechaje APK Pocket Option", url: APK_DOWNLOAD_URL },
      { text: "🌐 Rejoin Group VIP", url: TELEGRAM_GROUP_URL }
    ],
    [{ text: "📈 Ouvri Yon Kont Pocket Option", url: REGISTER_URL }]
  ];

  await sendTelegram(message, buttons);
}

async function scheduler() {
  if (schedulerBusy) return;
  schedulerBusy = true;

  try {
    const haiti = getHaitiDate();

    const dayKey = `${haiti.year}-${haiti.month}-${haiti.day}`;
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      openedToday = false;
      closedToday = false;
      warnedToday = false;
    }

    if (haiti.dayOfWeek === 0 || haiti.dayOfWeek === 6) return;

    const sessionButtons = [
      [
        { text: "📲 Telechaje APK", url: APK_DOWNLOAD_URL },
        { text: "👥 Gwoup Telegram", url: TELEGRAM_GROUP_URL }
      ]
    ];

    // 1. Louvri sesyon (8:00 AM)
    if (haiti.hour === START_HOUR && haiti.minute === 0 && !openedToday) {
      openedToday = true;
      await sendTelegram(
        `🟢 <b>SMARTASSET VIP SESSION OPENED</b>\n\n` +
        `Bonjou tout moun! Sesyon trading pou jodi a kòmanse. Bot la ap analize mache a.\n\n` +
        `⏰ <b>ORÈ:</b> 08:00 AM - 10:00 AM\n` +
        `📈 <b>PAIRS:</b> ${PAIRS.join(", ")}\n\n` +
        `<i>Swiv jesyon kapital ou pi byen! Bon trading! 🚀</i>`,
        sessionButtons
      );
    }

    // 2. Avètisman (9:55 AM)
    if (haiti.hour === END_HOUR - 1 && haiti.minute === 55 && !warnedToday) {
      warnedToday = true;
      await sendTelegram(
        `⚠️ <b>ATTENTION: SESYON AN AP FINI!</b>\n\n` +
        `Sesyon trading an ap bout nan 5 minit (10:00 AM). Mèsi ak tout moun ki te la jodi a! ⌛`
      );
    }

    // 3. Fèmen sesyon (10:00 AM)
    if (haiti.hour === END_HOUR && haiti.minute === 0 && !closedToday) {
      closedToday = true;
      await sendTelegram(
        `🔴 <b>SMARTASSET VIP SESSION CLOSED</b>\n\n` +
        `Sesyon an fini. Bot la nan mòd pause jiska demen maten 08:00 AM.\n\n` +
        `Mèsi ak tout moun ki te swiv siyal yo jodi a! 🔥`,
        sessionButtons
      );
    }

    if (haiti.hour < START_HOUR || haiti.hour >= END_HOUR) return;

    // Analize nan minit 4 / 9 rapid anvan 30 segonn yo rive
    const isPreparationMinute = haiti.minute % 5 === 4;
    const isTargetSecond = haiti.second >= 5 && haiti.second <= 15;
    if (!isPreparationMinute || !isTargetSecond) return;

    const slot = `${dayKey}-${haiti.hour}-${haiti.minute}`;
    if (slot === lastAnalysisSlot) return;
    lastAnalysisSlot = slot;

    console.log(`ANALYZING ALL PAIRS (${haiti.hour}:${haiti.minute}:${haiti.second})`);
    await analyzeAllPairsAndSendBest();
  } catch (err) {
    console.error("Scheduler error:", err.message);
  } finally {
    schedulerBusy = false;
  }
}

setInterval(scheduler, 1000);

app.listen(PORT, () => {
  console.log(`Server ap kouri sou port ${PORT}`);
});
