import { getBearerToken } from "@/lib/auth/client";

export type StreamMeta = {
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  title?: string;
};

export async function streamReply(
  body: Record<string, unknown>,
  onDelta: (chunk: string) => void,
  onMeta: (meta: StreamMeta) => void,
  signal: AbortSignal,
): Promise<StreamMeta> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("text/event-stream") || !response.body) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "BREVILO could not reply.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const meta: StreamMeta = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as {
        delta?: string;
        error?: string;
        meta?: StreamMeta;
      };
      if (payload.meta) {
        Object.assign(meta, payload.meta);
        onMeta(payload.meta);
      }
      if (payload.delta) onDelta(payload.delta);
      if (payload.error) throw new Error(payload.error);
    }
  }
  return meta;
}
