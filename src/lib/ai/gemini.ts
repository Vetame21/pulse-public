import "server-only";
import type { ReadClass } from "./timetable-photo";

// Reading a timetable photo with Gemini. Chosen to use few tokens: the cheapest
// "Flash-Lite" model, medium image detail (~530 tokens per photo), minimal
// thinking, a fixed JSON answer and a capped reply. About 1,000 tokens a photo.
const MODEL = "gemini-3.5-flash-lite";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT =
  "Read this class timetable. List every class session with: day (Mon-Sun), start and end time (24h HH:MM), " +
  "course title as written (English if both are shown), room, and teaching weeks like '1-7,9-17' (empty if not shown). " +
  "Use the period times printed on the timetable. Skip empty cells.";

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      day: { type: "STRING", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
      start: { type: "STRING" },
      end: { type: "STRING" },
      title: { type: "STRING" },
      room: { type: "STRING" },
      weeks: { type: "STRING" },
    },
    required: ["day", "start", "end", "title"],
  },
};

export type ReadResult = { ok: true; classes: ReadClass[] } | { ok: false; reason: "not_configured" | "timeout" | "failed" };

export async function readTimetablePhoto(imageBase64: string, mimeType: string): Promise<ReadResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: PROMPT }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          maxOutputTokens: 4096,
          temperature: 0,
          mediaResolution: "MEDIA_RESOLUTION_MEDIUM",
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
      // Usually a few seconds from the US server; slow networks (e.g. China → Google) can take much longer.
      signal: AbortSignal.timeout(50_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Gemini failed", res.status, (await res.text()).slice(0, 300));
      return { ok: false, reason: "failed" };
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const classes = JSON.parse(text) as ReadClass[];
    return { ok: true, classes: Array.isArray(classes) ? classes : [] };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { ok: false, reason: "timeout" };
    console.error("Gemini failed", error);
    return { ok: false, reason: "failed" };
  }
}
