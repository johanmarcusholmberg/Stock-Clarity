import pino from "pino";
const token = process.env.BETTER_STACK_SOURCE_TOKEN;
if (!token) { console.error("NO TOKEN"); process.exit(1); }
const endpoint = process.env.BETTER_STACK_ENDPOINT || "https://in.logs.betterstack.com";
const log = pino({
  level: "error",
  transport: {
    target: "@logtail/pino",
    options: { sourceToken: token, options: { endpoint } },
  },
});
log.error({ smokeTest: true, ts: new Date().toISOString(), marker: "STOCKCLARIFY-SMOKE-" + Math.random().toString(36).slice(2,8) }, "Better Stack smoke test from StockClarify api-server");
await new Promise(r => setTimeout(r, 4000));
console.log("flushed; check Better Stack live tail for marker above");
