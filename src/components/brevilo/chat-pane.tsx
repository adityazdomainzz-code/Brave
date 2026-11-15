import { useEffect, useRef, useState } from "react";
import { Check, Copy, Paperclip, Pencil, RefreshCw, Send, Square, X } from "lucide-react";
import { toast } from "sonner";
import { listMessages, uploadAttachment } from "@/lib/brevilo/data";
import { streamReply, type StreamMeta } from "@/lib/brevilo/stream";
import { CODE_LANGS, type Attachment, type ChatMessage, type ChatMode } from "@/lib/brevilo/types";
import { cn, formatBytes, formatTime } from "@/lib/brevilo/format";
import { Markdown } from "@/components/brevilo/markdown";

export type Launch = {
  mode: ChatMode;
  prompt: string;
  attachmentIds?: string[];
  attachmentNote?: string;
  language?: string;
};

const ACCEPT = ".txt,.pdf,.docx,.csv,.json,.js,.ts,.tsx,.jsx,.py,.php,.java,.c,.cpp,.h,.hpp,.css,.html,.sql,.md,.sk,.skript,.xml,.yml,.yaml";

const ASSISTANT_PROMPTS = [
  "Explain a tricky idea in plain language",
  "Draft a clear project brief",
  "Turn these notes into next steps",
  "Compare two approaches and recommend one",
];

const CODE_PROMPTS = [
  "Find the bug and explain the fix",
  "Write a Python function with a short test",
  "Review this SQL query",
  "Create a Minecraft Skript command",
];

export function ChatPane({
  mode,
  activeId,
  sessionKey,
  launchTick,
  peekLaunch,
  clearLaunch,
  onBind,
  onRefresh,
  enterToSend,
  title,
  onClear,
}: {
  mode: ChatMode;
  activeId: string | null;
  sessionKey: number;
  launchTick: number;
  peekLaunch: () => Launch | null;
  clearLaunch: () => void;
  onBind: (id: string) => void;
  onRefresh: () => Promise<void>;
  enterToSend: boolean;
  title: string;
  onClear: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [language, setLanguage] = useState<string>("python");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const activeRef = useRef(activeId);
  const skipRef = useRef<string | null>(null);
  activeRef.current = activeId;

  useEffect(() => {
    abortRef.current?.abort();
    streamingRef.current = false;
    setStreaming(false);
    setMessages([]);
    setEditingId(null);
  }, [sessionKey]);

  useEffect(() => {
    if (!activeId) {
      if (!streamingRef.current) setMessages([]);
      return;
    }
    if (skipRef.current === activeId) {
      skipRef.current = null;
      return;
    }
    let cancel = false;
    setLoading(true);
    listMessages({ data: activeId })
      .then((rows) => {
        if (!cancel) setMessages(rows);
      })
      .catch(() => {
        if (!cancel) toast.error("Couldn't load that conversation.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [activeId]);

  useEffect(() => {
    const launch = peekLaunch();
    if (!launch || launch.mode !== mode) return;
    clearLaunch();
    void send(launch.prompt, launch.attachmentIds ?? [], launch.attachmentNote ?? "", launch.language || language);
    // launch is explicit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchTick]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, 4 - pending.length)) {
      if (file.size > 2_000_000) {
        toast.error(`${file.name} is over 2 MB.`);
        continue;
      }
      try {
        const dataBase64 = await readBase64(file);
        const saved = await uploadAttachment({
          data: { filename: file.name, mime: file.type || "application/octet-stream", dataBase64 },
        });
        setPending((current) => [...current, saved].slice(0, 4));
        toast.success(`${saved.filename} attached`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    }
  }

  async function send(text: string, attachmentIds: string[], attachmentNote: string, lang: string, action: "send" | "regenerate" | "resend" = "send", messageId?: string) {
    const content = text.trim();
    if (streamingRef.current) return;
    if (action === "send" && !content && attachmentIds.length === 0) return;
    streamingRef.current = true;
    setStreaming(true);
    setEditingId(null);
    const tempId = crypto.randomUUID();
    if (action === "send") {
      const shown = content || "Review the attached file.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: shown,
          createdAt: new Date().toISOString(),
          attachmentNote,
        },
        { id: tempId, role: "assistant", content: "", createdAt: new Date().toISOString(), attachmentNote: "" },
      ]);
      setDraft("");
      setPending([]);
    } else if (action === "regenerate") {
      setMessages((prev) => {
        const next = [...prev];
        if (next.at(-1)?.role === "assistant") next.pop();
        next.push({ id: tempId, role: "assistant", content: "", createdAt: new Date().toISOString(), attachmentNote: "" });
        return next;
      });
    } else if (messageId) {
      setMessages((prev) => {
        const index = prev.findIndex((item) => item.id === messageId);
        if (index < 0) return prev;
        const next = prev.slice(0, index);
        next.push({ ...prev[index], content });
        next.push({ id: tempId, role: "assistant", content: "", createdAt: new Date().toISOString(), attachmentNote: "" });
        return next;
      });
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    let queued = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      const chunk = queued;
      queued = "";
      if (!chunk) return;
      setMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, content: item.content + chunk } : item)));
    };
    try {
      const meta = await streamReply(
        {
          action,
          mode,
          conversationId: activeRef.current,
          content,
          messageId: messageId ?? null,
          attachmentIds,
          language: lang,
        },
        (delta) => {
          acc += delta;
          queued += delta;
          if (!frame) frame = window.requestAnimationFrame(flush);
        },
        (next: StreamMeta) => {
          if (next.conversationId && next.conversationId !== activeRef.current) {
            skipRef.current = next.conversationId;
            onBind(next.conversationId);
          }
        },
        ctrl.signal,
      );
      if (frame) cancelAnimationFrame(frame);
      flush();
      if (meta.assistantMessageId) {
        setMessages((prev) =>
          prev.map((item) => (item.id === tempId ? { ...item, id: meta.assistantMessageId!, content: acc || item.content } : item)),
        );
      }
      await onRefresh();
    } catch (err) {
      if (frame) cancelAnimationFrame(frame);
      flush();
      if (!ctrl.signal.aborted) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        toast.error(message);
        if (!acc) setMessages((prev) => prev.filter((item) => item.id !== tempId || item.content));
      }
    } finally {
      streamingRef.current = false;
      setStreaming(false);
    }
  }

  const empty = messages.length === 0 && !loading;
  const prompts = mode === "code" ? CODE_PROMPTS : ASSISTANT_PROMPTS;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">{mode === "code" ? "Code studio" : "Assistant"}</p>
          <h1 className="display truncate text-xl font-bold">{title}</h1>
        </div>
        {activeId ? (
          <button type="button" className="btn btn-ghost press" onClick={onClear}>
            Clear chat
          </button>
        ) : null}
      </header>
      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (!el) return;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6"
      >
        {loading ? (
          <div className="mx-auto flex max-w-3xl items-center gap-3 py-10 text-muted">
            <span className="spin" />
            Loading conversation
          </div>
        ) : null}
        {empty ? (
          <div className="rise mx-auto flex max-w-3xl flex-col gap-6 py-8 md:py-14">
            <div>
              <h2 className="display text-3xl font-bold leading-tight md:text-4xl">
                {mode === "code" ? "What should we build?" : "What do you want to work on?"}
              </h2>
              <p className="mt-3 max-w-xl text-muted">
                {mode === "code"
                  ? "Debug, generate, and tighten code across the languages BREVILO knows."
                  : "Ask a question, pressure-test an idea, or hand over a file."}
              </p>
            </div>
            {mode === "code" ? (
              <div className="flex flex-wrap gap-2">
                {CODE_LANGS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-active={language === item.id}
                    className="nav-item press w-auto px-3"
                    onClick={() => setLanguage(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="glass press rounded-xl px-4 py-4 text-left"
                  onClick={() => void send(prompt, [], "", language)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 py-2">
            {messages.map((message, index) => {
              const last = index === messages.length - 1;
              const mine = message.role === "user";
              return (
                <article key={message.id} className={cn("rise flex flex-col gap-2", mine ? "items-end" : "items-start")}>
                  {editingId === message.id ? (
                    <div className="glass w-full max-w-xl rounded-xl p-3">
                      <textarea className="field min-h-24" value={editText} onChange={(event) => setEditText(event.target.value)} />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost press" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary press"
                          onClick={() => void send(editText, [], message.attachmentNote, language, "resend", message.id)}
                        >
                          Save and resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "max-w-xl rounded-xl px-4 py-3",
                        mine ? "bg-accent text-accent-fg" : "w-full max-w-3xl bg-transparent px-0",
                      )}
                    >
                      {mine ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      ) : message.content ? (
                        <div className={streaming && last ? "caret" : undefined}>
                          <Markdown text={message.content} />
                        </div>
                      ) : (
                        <p className="flex items-center gap-2 text-muted">
                          BREVILO is writing <span className="dots"><i /><i /><i /></span>
                        </p>
                      )}
                      {message.attachmentNote ? (
                        <p className={cn("mt-2 text-xs", mine ? "text-accent-fg/80" : "text-subtle")}>
                          Files: {message.attachmentNote}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-subtle">
                    <time>{formatTime(message.createdAt)}</time>
                    {mine && editingId !== message.id ? (
                      <button
                        type="button"
                        className="icon-btn h-9 w-9"
                        aria-label="Edit message"
                        onClick={() => {
                          setEditingId(message.id);
                          setEditText(message.content);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    ) : null}
                    {!mine && message.content ? (
                      <>
                        <button
                          type="button"
                          className="icon-btn h-9 w-9"
                          aria-label="Copy reply"
                          onClick={() => {
                            void navigator.clipboard.writeText(message.content).then(() => {
                              setCopiedId(message.id);
                              toast.success("Reply copied");
                            });
                          }}
                        >
                          {copiedId === message.id ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                        {last ? (
                          <button
                            type="button"
                            className="icon-btn h-9 w-9"
                            aria-label="Regenerate reply"
                            disabled={streaming}
                            onClick={() => void send("", [], "", language, "regenerate")}
                          >
                            <RefreshCw size={15} />
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="glass mx-auto max-w-3xl rounded-xl p-3">
          {mode === "code" && !empty ? (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {CODE_LANGS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="nav-item press w-auto shrink-0 px-3"
                  data-active={language === item.id}
                  onClick={() => setLanguage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          {pending.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((file) => (
                <span key={file.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-elev-2 px-3 py-1 text-sm">
                  {file.filename}
                  <span className="text-subtle">{formatBytes(file.sizeBytes)}</span>
                  <button type="button" aria-label={`Remove ${file.filename}`} onClick={() => setPending((current) => current.filter((item) => item.id !== file.id))}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <label className="icon-btn press" aria-label="Attach a file">
              <Paperclip size={18} />
              <input
                className="sr-only"
                type="file"
                accept={ACCEPT}
                multiple
                onChange={(event) => {
                  void onUpload(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <textarea
              className="field max-h-40 min-h-11 resize-none"
              placeholder={mode === "code" ? "Describe the code you need" : "Message BREVILO"}
              value={draft}
              rows={1}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const sendNow = enterToSend ? !event.shiftKey : event.metaKey || event.ctrlKey;
                if (!sendNow) return;
                event.preventDefault();
                void send(draft, pending.map((file) => file.id), pending.map((file) => file.filename).join(", "), language);
              }}
            />
            {streaming ? (
              <button type="button" className="btn btn-ghost press" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                <Square size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary press"
                aria-label="Send"
                onClick={() => void send(draft, pending.map((file) => file.id), pending.map((file) => file.filename).join(", "), language)}
              >
                <Send size={16} />
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-subtle">
            {enterToSend ? "Enter sends. Shift+Enter adds a line." : "Ctrl or Cmd+Enter sends."}
          </p>
        </div>
      </div>
    </section>
  );
}

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}
