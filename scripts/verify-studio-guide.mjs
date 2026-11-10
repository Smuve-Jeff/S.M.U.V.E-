/*
 * Browser verification for the Studio Masterclass guide.
 *
 * Checks structure, media, filtering, details, progress persistence and
 * layout overflow, then writes desktop and mobile screenshots.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.GUIDE_URL || "http://127.0.0.1:3000/index.html";
const OUT = "artifacts/studio-lessons";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
});

const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

// Headless Chromium ships no speech voices. Install a deterministic bank so the
// per-sentence rotation can be verified without real audio output.
await page.addInitScript(() => {
  const mk = (name, lang) => ({ name, lang, voiceURI: name, localService: true, default: false });
  const fake = [
    mk("Daniel", "en-GB"), mk("Arthur", "en-GB"), mk("Ryan", "en-GB"),
    mk("Guy", "en-US"), mk("Christopher", "en-US"), mk("Brian", "en-US"),
    mk("Sonia", "en-GB"), mk("Libby", "en-GB"),
    mk("Aria", "en-US"), mk("Jenny", "en-US"), mk("Michelle", "en-US"), mk("Ava", "en-US"),
  ];
  const spoken = [];
  window.__spoken = spoken;
  const synth = window.speechSynthesis;
  Object.defineProperty(synth, "getVoices", { value: () => fake, configurable: true });
  synth.cancel = () => {};
  synth.resume = () => {};
  Object.defineProperty(synth, "speak", {
    configurable: true,
    value: (utterance) => {
      spoken.push({
        text: utterance.text,
        voice: utterance.voice && utterance.voice.name,
        rate: utterance.rate,
        pitch: utterance.pitch,
      });
      // Slow enough that the live-voice indicator can be observed mid-read.
      setTimeout(() => { if (typeof utterance.onend === "function") utterance.onend(); }, 40);
    },
  });
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const httpErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.message));
page.on("requestfailed", (req) => {
  const error = req.failure()?.errorText || "unknown";
  // Browsers abort media range requests whenever a <video> is paused,
  // re-loaded or replaced. Those aborts are expected; HTTP errors are not.
  if (error.includes("ERR_ABORTED") && /\.(mp4|webm|jpg|png)(\?|$)/.test(req.url())) return;
  failedRequests.push(`${req.url()} :: ${error}`);
});
page.on("response", (res) => {
  if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`);
});

await page.goto(BASE, { waitUntil: "load" });

// 1. structure
const cardCount = await page.locator(".lesson").count();
check("24 lesson cards rendered", cardCount === 24, `${cardCount} cards`);

const dataCount = await page.evaluate(() => window.STUDIO_LESSONS.length);
check("lessons.js exposes 24 entries", dataCount === 24, `${dataCount} entries`);

const uniqueIds = await page.evaluate(() => new Set(window.STUDIO_LESSONS.map((l) => l.id)).size);
check("chapter ids are unique", uniqueIds === 24, `${uniqueIds} ids`);

// 2. every clip actually loads and decodes metadata
const mediaReport = await page.evaluate(async () => {
  const cards = [...document.querySelectorAll(".lesson")];
  const out = [];
  for (const card of cards) {
    const video = card.querySelector("video");
    const id = card.dataset.id;
    video.preload = "auto";
    video.load();
    const ok = await new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      video.addEventListener("loadeddata", () => done(true), { once: true });
      video.addEventListener("error", () => done(false), { once: true });
      setTimeout(() => done(false), 8000);
    });
    out.push({ id, ok, duration: video.duration, w: video.videoWidth, h: video.videoHeight, src: video.currentSrc });
  }
  return out;
});

const badClips = mediaReport.filter((m) => !m.ok || !(m.duration > 0));
check(
  "all 24 demo clips decode",
  badClips.length === 0,
  badClips.length ? badClips.map((b) => b.id).join(", ") : `${mediaReport.length}/24 ready at ${mediaReport[0]?.w}x${mediaReport[0]?.h}`
);

const wrongDurations = mediaReport.filter((m) => m.duration < 4.5 || m.duration > 5.6);
check("demo clips are ~5 seconds", wrongDurations.length === 0, wrongDurations.map((m) => `${m.id}:${m.duration.toFixed(2)}`).join(", ") || "5.00s ±0.1");

// 3. overview
const overview = await page.evaluate(async () => {
  const v = document.getElementById("overview");
  if (v.readyState < 1) {
    await new Promise((resolve) => {
      v.addEventListener("loadedmetadata", resolve, { once: true });
      setTimeout(resolve, 8000);
    });
  }
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, poster: v.getAttribute("poster"), src: v.currentSrc };
});
check("overview video loads", overview.duration > 0, `${overview.duration.toFixed(2)}s ${overview.w}x${overview.h}`);
check("overview is 120 seconds", Math.abs(overview.duration - 120) < 0.35, `${overview.duration.toFixed(2)}s`);
check("overview poster exists", Boolean(overview.poster), overview.poster);

// 4. controls exist
const speakButtons = await page.locator("[data-speak]").count();
check("read-aloud button on every card", speakButtons === 24, `${speakButtons} buttons`);
const detailsButtons = await page.locator("[data-details]").count();
check("details button on every card", detailsButtons === 24, `${detailsButtons} buttons`);
const checkboxes = await page.locator("[data-done]").count();
check("mastered checkbox on every card", checkboxes === 24, `${checkboxes} checkboxes`);

// 5. interaction: details expands
const firstCard = page.locator(".lesson").first();
await firstCard.locator("[data-details]").click();
// The panel animates open over 280 ms; measure after it settles.
await page.waitForTimeout(500);
const expanded = await page.evaluate(() => {
  const details = document.querySelector(".lesson .details");
  const button = document.querySelector(".lesson [data-details]");
  return {
    openClass: details.classList.contains("open"),
    height: Math.round(details.getBoundingClientRect().height),
    expandedAttr: button.getAttribute("aria-expanded"),
    featureCount: details.querySelectorAll(".features li").length,
    stepCount: details.querySelectorAll(".try li").length,
    mistake: (details.querySelector(".mistake")?.textContent || "").trim().length,
  };
});
check(
  "lesson details expand",
  expanded.openClass && expanded.height > 100 && expanded.expandedAttr === "true" && expanded.featureCount >= 4 && expanded.stepCount === 3 && expanded.mistake > 30,
  JSON.stringify(expanded)
);

// 6. interaction: video play/pause
await firstCard.locator("[data-play]").click();
await page.waitForTimeout(600);
const playing = await page.evaluate(() => !document.querySelector(".lesson video").paused);
check("demo plays on tap", playing);
await firstCard.locator("[data-play]").click();
await page.waitForTimeout(200);
const paused = await page.evaluate(() => document.querySelector(".lesson video").paused);
check("demo pauses on second tap", paused);

// 7. search
await page.fill("#search", "sampler");
await page.waitForTimeout(250);
const searchVisible = await page.evaluate(() =>
  [...document.querySelectorAll(".lesson")].filter((n) => !n.hidden).map((n) => n.dataset.id)
);
check("search narrows the grid", searchVisible.length > 0 && searchVisible.length < 24, `${searchVisible.length} shown: ${searchVisible.join(", ")}`);
check("search finds the Sampler chapter", searchVisible.includes("sampler"));

await page.fill("#search", "zzzz-no-match");
await page.waitForTimeout(250);
const emptyState = await page.locator(".empty").count();
check("empty search shows guidance", emptyState === 1);
await page.fill("#search", "");
await page.waitForTimeout(250);

// 8. group filter
const chipCount = await page.locator(".chip").count();
await page.locator('.chip[data-group="Mix & Polish"]').click();
await page.waitForTimeout(200);
const filtered = await page.evaluate(() =>
  [...document.querySelectorAll(".lesson")]
    .filter((n) => !n.hidden)
    .map((n) => ({ id: n.dataset.id, group: n.dataset.group }))
);
check(
  "group filter works",
  filtered.length > 0 && filtered.every((entry) => entry.group === "Mix & Polish"),
  `${filtered.length} shown, ${chipCount} chips`
);
await page.locator('.chip[data-group="All"]').click();
await page.waitForTimeout(200);

// 9. progress persistence
await page.locator('.lesson[data-id="quick-session"] [data-done]').check();
await page.waitForTimeout(200);
const labelAfter = await page.locator("#progress-label").textContent();
const stored = await page.evaluate(() => localStorage.getItem("smuve-masterclass-mastered-v1"));
check("mastered count updates", /1 \/ 24/.test(labelAfter), labelAfter.trim());
check("mastered state persists", stored && stored.includes("quick-session"), stored);

await page.reload({ waitUntil: "load" });
await page.waitForTimeout(400);
const restored = await page.evaluate(() =>
  document.querySelector('.lesson[data-id="quick-session"]').classList.contains("mastered")
);
check("mastered state survives reload", restored);
await page.locator('.lesson[data-id="quick-session"] [data-done]').uncheck();
await page.waitForTimeout(150);

// 10. read-aloud: one rotating male/female voice per sentence
const speech = await page.evaluate(() => ({
  api: "speechSynthesis" in window,
  voices: window.speechSynthesis.getVoices().length,
  disabled: document.querySelector("[data-speak]").disabled,
}));

const plan = await page.evaluate(() => {
  const turns = window.__smuveSpeech.planVoices(
    Array.from({ length: 12 }, (_, i) => `sentence ${i + 1}`)
  );
  return {
    genders: turns.map((t) => t.gender.charAt(0)),
    voices: turns.map((t) => (t.voice ? t.voice.name : null)),
    pitches: turns.map((t) => Number(t.pitch.toFixed(2))),
    rates: turns.map((t) => Number(t.rate.toFixed(2))),
    bank: window.__smuveSpeech.bank(),
  };
});

const alternating = plan.genders.every((g, i) => i === 0 || g !== plan.genders[i - 1]);
const plannedVoices = new Set(plan.voices).size;
const plannedPitch = new Set(plan.pitches).size;
const plannedRate = new Set(plan.rates).size;

check(
  "voice bank holds male and female voices",
  plan.bank.male.length >= 3 && plan.bank.female.length >= 3,
  `${plan.bank.male.length} male, ${plan.bank.female.length} female`
);
check("planner alternates gender every sentence", alternating && new Set(plan.genders).size === 2, plan.genders.join(""));
check("planner rotates across the bank", plannedVoices >= 4, `${plannedVoices} distinct voices`);
check(
  "planner varies pitch and rate every sentence",
  plannedPitch >= 6 && plannedRate >= 6,
  `${plannedPitch} pitches, ${plannedRate} rates`
);

await page.evaluate(() => { window.__spoken.length = 0; });
await page.locator('.lesson[data-id="masterclass"] [data-speak]').click();
await page.waitForTimeout(600);
const midRead = await page.evaluate(() => ({
  label: document.querySelector('.lesson[data-id="masterclass"] [data-voice-name]')?.textContent || "",
  visible: !document.querySelector('.lesson[data-id="masterclass"] [data-voice]')?.hidden,
  pressed: document.querySelector('.lesson[data-id="masterclass"] [data-speak]')?.getAttribute("aria-pressed"),
}));
await page.waitForTimeout(2400);
const speechRun = await page.evaluate(() => ({
  spoken: window.__spoken.slice(),
  cleanedUp: document.querySelector('.lesson[data-id="masterclass"] [data-voice]')?.hidden === true,
}));
const spokenPitch = new Set(speechRun.spoken.map((s) => Number(s.pitch).toFixed(2))).size;
const spokenRate = new Set(speechRun.spoken.map((s) => Number(s.rate).toFixed(2))).size;

check("read-aloud is wired", speech.api && !speech.disabled, `${speech.voices} voices in the bank`);
check("read-aloud speaks sentence by sentence", speechRun.spoken.length >= 10, `${speechRun.spoken.length} utterances`);
check(
  "spoken sentences vary pitch and rate",
  spokenPitch >= 6 && spokenRate >= 6,
  `${spokenPitch} pitches, ${spokenRate} rates`
);
check("card shows the live voice mid-read", midRead.visible && midRead.pressed === "true" && midRead.label.includes("male"), midRead.label);
check("voice indicator clears when the lesson ends", speechRun.cleanedUp);

// 11. overflow / layout
const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow at 1440", desktopOverflow <= 1, `${desktopOverflow}px`);

// Full page first, then a clean top-of-page viewport.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/guide-full-page.png`, fullPage: true });
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/guide-desktop.png`, fullPage: false });

const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(BASE, { waitUntil: "load" });
await mobile.waitForTimeout(600);
const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow at 390", mobileOverflow <= 1, `${mobileOverflow}px`);
const mobileCols = await mobile.evaluate(() =>
  getComputedStyle(document.getElementById("grid")).gridTemplateColumns.split(" ").length
);
check("mobile grid is single column", mobileCols === 1, `${mobileCols} column(s)`);
await mobile.screenshot({ path: `${OUT}/guide-mobile.png`, fullPage: false });

// 12. errors
const relevantErrors = consoleErrors.filter((e) => !/favicon/i.test(e));
check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
check("no console errors", relevantErrors.length === 0, relevantErrors.slice(0, 3).join(" | "));
const relevantFailed = failedRequests.filter((r) => !/favicon/i.test(r));
check("no failed requests", relevantFailed.length === 0, relevantFailed.slice(0, 3).join(" | "));
check("no HTTP errors", httpErrors.length === 0, httpErrors.slice(0, 3).join(" | "));

const summary = {
  base: BASE,
  checkedAt: new Date().toISOString(),
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  results,
  media: mediaReport.map(({ id, duration, w, h, ok }) => ({ id, ok, duration: Number(duration.toFixed(2)), w, h })),
  speech,
};
writeFileSync(`${OUT}/verification.json`, JSON.stringify(summary, null, 2));

console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
await browser.close();
process.exit(summary.failed ? 1 : 0);
