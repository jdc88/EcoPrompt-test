const HF_CHAT_URL =
  process.env.HF_CHAT_URL ||
  "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const HF_TOKEN = process.env.HUGGINGFACEHUB_API_TOKEN || "";

export async function chatCompletion({ system, user, temperature = 0 }) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }

  const res = await fetch(HF_CHAT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: HF_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: 220,
    }),
  });

  if (!res.ok) {
    throw new Error(`HF inference failed (${res.status})`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  return {
    text,
    model: data?.model || HF_MODEL,
    usage: data?.usage || {},
  };
}
