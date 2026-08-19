const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID || "@smartasset_vip_signal";

const PAIRS = ["EUR/USD", "GBP/USD"];

const INTERVAL = "5min";
const MIN_SCORE = 90;

let lastSignalKey = "";

app.get("/", (req, res) => {
  res.status(200).send(
    "SMARTASSET Pocket Option Signal Bot ap kouri."
  );
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN manke.");
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      {
        timeout: 10000
      }
    );

    console.log("Telegram signal voye.");
  } catch (error) {
    console.error(
      "Telegram error:",
      error.response?.data || error.message
    );
  }
}

async function getCandles(symbol) {
  if (!TWELVE_DATA_API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY manke.");
  }

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

  let result =
    values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    result =
      (values[i] - result) * multiplier + result;
  }

  return result;
}

function calculateEMAArray(values, period) {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);

  let current =
    values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const result = new Array(period - 1).fill(null);
  result.push(current);

  for (let i = period; i < values.length; i++) {
    current =
      (values[i] - current) * multiplier + current;

    result.push(current);
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;

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

    avgGain =
      (avgGain * (period - 1) + gain) / period;

    avgLoss =
      (avgLoss * (period - 1) + loss) / period;
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
    if (fast[i] == null || slow[i] == null) {
      macd.push(null);
    } else {
      macd.push(fast[i] - slow[i]);
    }
  }

  const validMACD = macd.filter(v => v !== null);

  if (validMACD.length < 9) {
    return null;
  }

  const signalArray = calculateEMAArray(validMACD, 9);

  const lastMACD =
    validMACD[validMACD.length - 1];

  const lastSignal =
    signalArray[signalArray.length - 1];

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
  /*
    Nou itilize dènye candle ki FÈMEN.
    Sa evite pran yon candle ki poko fini kòm confirmation.
  */

  const closes = candles.map(c => c.close);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);

  const rsiValue = rsi(closes, 14);
  const macd = calculateMACD(closes);

  if (
    ema9 == null ||
    ema21 == null ||
    ema50 == null ||
    rsiValue == null ||
    !macd
  ) {
    return null;
  }

  let callScore = 0;
  let putScore = 0;

  const reasonsCall = [];
  const reasonsPut = [];

  // 1. EMA 9/21
  if (ema9 > ema21) {
    callScore += 20;
    reasonsCall.push("EMA 9 > EMA 21");
  }

  if (ema9 < ema21) {
    putScore += 20;
    reasonsPut.push("EMA 9 < EMA 21");
  }

  // 2. EMA 21/50 trend
  if (ema21 > ema50) {
    callScore += 20;
    reasonsCall.push("Trend bullish");
  }

  if (ema21 < ema50) {
    putScore += 20;
    reasonsPut.push("Trend bearish");
  }

  // 3. RSI
  if (rsiValue >= 52 && rsiValue <= 68) {
    callScore += 20;
    reasonsCall.push(`RSI ${rsiValue.toFixed(1)}`);
  }

  if (rsiValue <= 48 && rsiValue >= 32) {
    putScore += 20;
    reasonsPut.push(`RSI ${rsiValue.toFixed(1)}`);
  }

  // 4. MACD
  if (macd.bullish) {
    callScore += 20;
    reasonsCall.push("MACD bullish");
  }

  if (macd.bearish) {
    putScore += 20;
    reasonsPut.push("MACD bearish");
  }

  // 5. Candle confirmation
  const lastDirection = candleDirection(last);
  const previousDirection = candleDirection(previous);

  if (
    lastDirection === "bullish" &&
    previousDirection === "bullish"
  ) {
    callScore += 20;
    reasonsCall.push("2 bullish candles");
  }

  if (
    lastDirection === "bearish" &&
    previousDirection === "bearish"
  ) {
    putScore += 20;
    reasonsPut.push("2 bearish candles");
  }

  let direction = null;
  let score = 0;
  let reasons = [];

  if (callScore > putScore) {
    direction = "CALL";
    score = callScore;
    reasons = reasonsCall;
  } else if (putScore > callScore) {
    direction = "PUT";
    score = putScore;
    reasons = reasonsPut;
  }

  return {
    direction,
    score,
    reasons,
    rsi: rsiValue,
    ema9,
    ema21,
    ema50,
    macd,
    lastCandle: last
  };
}

function getNextEntryTime() {
  const now = new Date();

  const next = new Date(now);

  const currentMinute = now.getUTCMinutes();

  const nextMinute =
    Math.floor(currentMinute / 5) * 5 + 5;

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

    if (!analysis) {
      console.log(`${symbol}: analiz pa disponib.`);
      return;
    }

    console.log(
      `${symbol}: ${analysis.direction} ${analysis.score}/100`
    );

    if (
      !analysis.direction ||
      analysis.score < MIN_SCORE
    ) {
      console.log(
        `${symbol}: NO SIGNAL (${analysis.score}/100)`
      );

      return;
    }

    const entry = getNextEntryTime();

    const exit = new Date(entry.getTime() + 5 * 60 * 1000);

    const signalKey =
      `${symbol}-${entry.toISOString()}-${analysis.direction}`;

    if (signalKey === lastSignalKey) {
      return;
    }

    lastSignalKey = signalKey;

    const emoji =
      analysis.direction === "CALL" ? "🟢" : "🔴";

    const action =
      analysis.direction === "CALL"
        ? "CALL / BUY"
        : "PUT / SELL";

    const message = `
🚨 <b>SMARTASSET POCKET OPTION SIGNAL</b>

💱 <b>PAIR:</b> ${symbol}

${emoji} <b>DIRECTION:</b> ${action}

⏰ <b>ENTRY:</b> ${formatTime(entry)}
⌛ <b>EXPIRY:</b> 5 MINUTES
🏁 <b>CLOSE:</b> ${formatTime(exit)}

🎯 <b>SIGNAL SCORE:</b> ${analysis.score}/100

📊 <b>ANALYSIS</b>
${analysis.reasons.map(x => `✅ ${x}`).join("\n")}

📈 RSI: ${analysis.rsi.toFixed(1)}

🕐 <b>PREPARE NOW</b>
<b>ENTER AT ${formatTime(entry)}</b>

⚠️ Signal bot la pa egzekite trade sou Pocket Option.
`;

    await sendTelegramMessage(message);

  } catch (error) {
    console.error(
      `${symbol} analysis error:`,
      error.message
    );
  }
}

let lastAnalysisSlot = "";

async function scheduler() {
  const now = new Date();

  const minute = now.getUTCMinutes();
  const second = now.getUTCSeconds();

  /*
    Egzanp:
    10:49 -> prepare signal pou 10:50.
    10:54 -> prepare signal pou 10:55.
  */

  const isPreparationMinute =
    minute % 5 === 4;

  if (!isPreparationMinute) return;

  /*
    Nou analize yon sèl fwa pandan minit preparation lan.
  */

  const slot =
    `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${minute}`;

  if (slot === lastAnalysisSlot) return;

  /*
    Bay market data yon ti moman pou li mete dènye candle fèmen an.
  */

  if (second < 10 || second > 35) return;

  lastAnalysisSlot = slot;

  console.log(
    `\n🔎 PREPARATION ANALYSIS ${now.toISOString()}`
  );

  for (const pair of PAIRS) {
    await generateSignal(pair);
    await sleep(1500);
  }
}

async function startup() {
  console.log("====================================");
  console.log(" SMARTASSET POCKET OPTION BOT");
  console.log(" EUR/USD + GBP/USD");
  console.log(" 5 MINUTES");
  console.log(` MINIMUM SCORE: ${MIN_SCORE}/100`);
  console.log(" TELEGRAM SIGNAL MODE");
  console.log("====================================");

  if (!TWELVE_DATA_API_KEY) {
    console.error("❌ TWELVE_DATA_API_KEY pa konfigire.");
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error("❌ TELEGRAM_BOT_TOKEN pa konfigire.");
  }

  if (TWELVE_DATA_API_KEY && TELEGRAM_BOT_TOKEN) {
    await sendTelegramMessage(
      "🤖 <b>SMARTASSET SIGNAL BOT ONLINE</b>\n\n" +
      "💱 EUR/USD\n" +
      "💱 GBP/USD\n" +
      "⏱ Timeframe: 5 MIN\n" +
      "🎯 Minimum score: 90/100\n\n" +
      "Bot la ap siveye mache a."
    );
  }
}

setInterval(scheduler, 1000);

app.listen(PORT, async () => {
  console.log(`🚀 Server ap kouri sou port ${PORT}`);
  await startup();
});
