const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

const TWELVE_DATA_API_KEY = "4f982e823b3646cc96a5c9db44bf53fd";
const TELEGRAM_BOT_TOKEN = "8875684135:AAFPGkJKDnxTzNGdH7rIfqzwyofy40cB3Ek";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@smartasset_vip_signal";

const PAIRS = ["EUR/USD", "GBP/USD"];
const INTERVAL = "5min";
const MIN_SCORE = 70;

// Config Orè Travay (Lè Ayiti / UTC-4)
const START_HOUR = 8;  // 8:00 AM
const END_HOUR = 17;   // 5:00 PM

let lastSignalKey = "";
let openedToday = false;
let closedToday = false;
let warnedToday = false;

app.get("/", (req, res) => {
  res.status(200).send("SMARTASSET Pocket Option Signal Bot ap kouri.");
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHaitiDate() {
  const now = new Date();
  const haitiTimeStr = now.toLocaleString("en-US", { timeZone: "America/Port-au-Prince" });
  return new Date(haitiTimeStr);
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      { timeout: 10000 }
    );
    console.log("Telegram message voye kòrèkteman.");
  } catch (error) {
    console.error("Telegram error:", error.response?.data || error.message);
  }
}

async function getCandles(symbol) {
  const url = "https://api.twelvedata.com/time_series";
  const response = await axios.get(url, {
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

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

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
}

function ema(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    result = (values[i] - result) * multiplier + result;
  }
  return result;
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
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
  const previous = candles[candles.length - 2];

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsiValue = rsi(closes, 14);
  const macd = calculateMACD(closes);

  if (ema9 == null || ema21 == null || ema50 == null || rsiValue == null || !macd) {
    return null;
  }

  let callScore = 0, putScore = 0;
  const reasonsCall = [], reasonsPut = [];

  // Korije rezon yo san karaktè < oswa > pou Telegram ka li HTML la san erè
  if (ema9 > ema21) { callScore += 20; reasonsCall.push("EMA 9 pi wo pase EMA 21"); }
  if (ema9 < ema21) { putScore += 20; reasonsPut.push("EMA 9 pi ba pase EMA 21"); }

  if (ema21 > ema50) { callScore += 20; reasonsCall.push("Trend bullish"); }
  if (ema21 < ema50) { putScore += 20; reasonsPut.push("Trend bearish"); }

  if (rsiValue >= 50) { callScore += 20; reasonsCall.push(`RSI ${rsiValue.toFixed(1)}`); }
  if (rsiValue < 50) { putScore += 20; reasonsPut.push(`RSI ${rsiValue.toFixed(1)}`); }

  if (macd.bullish) { callScore += 20; reasonsCall.push("MACD bullish"); }
  if (macd.bearish) { putScore += 20; reasonsPut.push("MACD bearish"); }

  const lastDirection = candleDirection(last);
  const previousDirection = candleDirection(previous);

  if (lastDirection === "bullish" && previousDirection === "bullish") {
    callScore += 20; reasonsCall.push("2 bullish candles");
  }
  if (lastDirection === "bearish" && previousDirection === "bearish") {
    putScore += 20; reasonsPut.push("2 bearish candles");
  }

  let direction = null, score = 0, reasons = [];
  if (callScore > putScore) {
    direction = "CALL"; score = callScore; reasons = reasonsCall;
  } else if (putScore > callScore) {
    direction = "PUT"; score = putScore; reasons = reasonsPut;
  }

  return { direction, score, reasons, rsi: rsiValue, lastCandle: last };
}

function getNextEntryTime() {
  const now = new Date();
  const next = new Date(now);
  const currentMinute = now.getUTCMinutes();
  const nextMinute = Math.floor(currentMinute / 5) * 5 + 5;
  next.setUTCMinutes(nextMinute);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
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

async function generateSignal(symbol) {
  try {
    const candles = await getCandles(symbol);
    const analysis = analyze(candles);

    if (!analysis || !analysis.direction || analysis.score < MIN_SCORE) {
      console.log(`${symbol}: NO SIGNAL (${analysis ? analysis.score : 0}/100)`);
      return;
    }

    const entry = getNextEntryTime();
    const exit = new Date(entry.getTime() + 5 * 60 * 1000);
    const signalKey = `${symbol}-${entry.toISOString()}-${analysis.direction}`;

    if (signalKey === lastSignalKey) return;
    lastSignalKey = signalKey;

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

    await sendTelegram(message);
  } catch (error) {
    console.error(`${symbol} analysis error:`, error.message);
  }
}

let lastAnalysisSlot = "";

async function scheduler() {
  const haitiDate = getHaitiDate();
  const hour = haitiDate.getHours();
  const minute = haitiDate.getMinutes();

  // Reset chak swa nan minwi pou landamen
  if (hour === 0 && minute === 0) {
    openedToday = false;
    closedToday = false;
    warnedToday = false;
  }

  // 1. Mesaj Louvri Sesyon (8:00 AM)
  if (hour === START_HOUR && minute === 0 && !openedToday) {
    await sendTelegram(
      `🟢 <b>SMARTASSET VIP SESSION OPENED</b>\n\n` +
      `Bonjour a tous! Sesyon trading pou jodi a kòmanse an dirèk. Bot la ap kòmanse analize mache a.\n\n` +
      `⏰ <b>ORÈ:</b> 08:00 AM - 05:00 PM\n` +
      `📈 <b>PAIRS:</b> EUR/USD, GBP/USD\n\n` +
      `<i>Swiv jesyon kapital ou pi byen! Bon trading a tous! 🚀</i>`
    );
    openedToday = true;
  }

  // 2. Mesaj Avètisman Dènye Trad (4:55 PM)
  if (hour === 16 && minute === 55 && !warnedToday) {
    await sendTelegram(
      `⚠️ <b>ATTENTION: DÈNYE TRAD POU JODI A!</b>\n\n` +
      `Sesyon an ap fini nan 5 minit. Prepare n pou dènye siyal jounen an! ⌛`
    );
    warnedToday = true;
  }

  // 3. Mesaj Fermeture Sesyon (5:00 PM)
  if (hour === END_HOUR && minute === 0 && !closedToday) {
    await sendTelegram(
      `🔴 <b>SMARTASSET VIP SESSION CLOSED</b>\n\n` +
      `Sesyon trading pou jodi a rive nan bout li. Bot la antre nan mòd pause jiska demen maten 08:00 AM.\n\n` +
      `Mèsi ak tout moun ki te swiv siyal yo jodi a! N ap reprann demen pi rèd. 🔥`
    );
    closedToday = true;
  }

  // Pa voye siyal si nou andeyò orè (anvan 8:00 AM oswa apre 5:00 PM)
  if (hour < START_HOUR || hour >= END_HOUR) return;

  const now = new Date();
  const currentMin = now.getUTCMinutes();
  const second = now.getUTCSeconds();

  // Analize sèlman chak 5 minit (nan minit 4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59)
  const isPreparationMinute = currentMin % 5 === 4;
  if (!isPreparationMinute) return;

  const slot = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${currentMin}`;
  if (slot === lastAnalysisSlot) return;

  if (second < 10 || second > 35) return;
  lastAnalysisSlot = slot;

  console.log(`\n🔎 PREPARATION ANALYSIS ${now.toISOString()}`);
  for (const pair of PAIRS) {
    await generateSignal(pair);
    await sleep(1500);
  }
}

setInterval(scheduler, 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server ap kouri sou port ${PORT}`);
});
