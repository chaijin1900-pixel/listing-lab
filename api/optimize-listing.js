const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const MAX_INPUT_LENGTH = 3000;
const DAILY_LIMIT_PER_IP = 3;

// In-memory per-IP daily counter. Resets on restart / new serverless instance,
// which is acceptable for a demo quota.
const usageByIp = new Map();

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message, detail) {
  sendJson(response, statusCode, {
    error: message,
    ...(detail ? { detail } : {}),
  });
}

async function readJsonBody(request) {
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8") || "{}");
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32768) throw new Error("Request body is too large.");
  }

  return raw.trim() ? JSON.parse(raw) : {};
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "unknown";
}

function checkDailyQuota(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = usageByIp.get(ip);

  if (!entry || entry.day !== today) {
    usageByIp.set(ip, { day: today, count: 1 });
    return true;
  }

  if (entry.count >= DAILY_LIMIT_PER_IP) return false;

  entry.count += 1;
  return true;
}

const SYSTEM_PROMPT = [
  "You are a senior Amazon listing copywriter. The user pastes a raw Amazon listing",
  "(title plus bullet points). Rewrite it into higher-converting, keyword-rich copy in English.",
  "Respect any product category or target keywords the user provides.",
  "",
  "Respond with strict JSON only, using exactly these keys:",
  '- "title_optimized": string, the rewritten title (under 200 characters, no emoji).',
  '- "bullets_optimized": array of exactly 5 strings, each starting with an UPPERCASE hook word followed by a colon.',
  '- "keywords_suggested": array of 8 to 12 lowercase search keywords or phrases.',
  '- "rationale": object with keys "title" (string), "bullets" (array of 5 strings, one per optimized bullet), "keywords" (string).',
  "",
  "Every rationale value must be written in 简体中文, each under 40 个字, explaining what changed and why.",
  "Do not add any keys beyond the four listed. Do not wrap the JSON in markdown fences.",
].join("\n");

function buildUserMessage(listing, category, keywords) {
  const parts = [];
  if (category) parts.push(`Product category: ${category}`);
  if (keywords) parts.push(`Target keywords: ${keywords}`);
  parts.push("Raw listing to optimize:");
  parts.push(listing);
  return parts.join("\n\n");
}

function normalizeStringArray(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, maxItems);
}

function normalizeResult(parsed) {
  const title = typeof parsed.title_optimized === "string" ? parsed.title_optimized.trim() : "";
  const bullets = normalizeStringArray(parsed.bullets_optimized, 5);
  const keywords = normalizeStringArray(parsed.keywords_suggested, 12);

  if (!title || bullets.length === 0) return null;

  const rawRationale = parsed.rationale;
  let rationale = { title: "", bullets: [], keywords: "" };
  if (rawRationale && typeof rawRationale === "object" && !Array.isArray(rawRationale)) {
    rationale = {
      title: typeof rawRationale.title === "string" ? rawRationale.title.trim() : "",
      bullets: normalizeStringArray(rawRationale.bullets, 5),
      keywords: typeof rawRationale.keywords === "string" ? rawRationale.keywords.trim() : "",
    };
  } else if (typeof rawRationale === "string") {
    rationale = { title: rawRationale.trim(), bullets: [], keywords: "" };
  }

  return {
    title_optimized: title,
    bullets_optimized: bullets,
    keywords_suggested: keywords,
    rationale,
  };
}

async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return sendError(response, 405, "Only POST requests are supported.");
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return sendError(response, 400, "Invalid JSON request body.");
  }

  const listing = typeof body.listing === "string" ? body.listing.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 120) : "";
  const keywords = typeof body.keywords === "string" ? body.keywords.trim().slice(0, 200) : "";

  if (!listing) {
    return sendError(response, 400, "请先粘贴需要优化的 Listing 内容。");
  }
  if (listing.length > MAX_INPUT_LENGTH) {
    return sendError(response, 400, `Listing 内容超过 ${MAX_INPUT_LENGTH} 字符上限。`);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return sendError(response, 500, "Missing DEEPSEEK_API_KEY. Add it to your environment variables.");
  }

  if (!checkDailyQuota(clientIp(request))) {
    return sendError(response, 429, "今日演示额度已用完");
  }

  try {
    const upstream = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(listing, category, keywords) },
        ],
      }),
    });

    const payload = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      // Only forward the upstream error string; never relay the raw payload.
      const detail = typeof payload?.error?.message === "string" ? payload.error.message : undefined;
      return sendError(response, upstream.status || 502, "DeepSeek request failed.", detail);
    }

    const content = payload?.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return sendError(response, 502, "模型返回格式异常，请重试。");
    }

    const result = normalizeResult(parsed);
    if (!result) {
      return sendError(response, 502, "模型返回内容不完整，请重试。");
    }

    return sendJson(response, 200, result);
  } catch (error) {
    return sendError(
      response,
      502,
      "Unable to reach DeepSeek right now.",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
