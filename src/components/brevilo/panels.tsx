import { useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import { FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAttachment, listAttachments } from "@/lib/brevilo/data";
import { ACCENT_PRESETS, type Attachment, type ChatMode, type Profile, type ProfilePatch, type ResponseStyle, type ThemeName, type ViewId } from "@/lib/brevilo/types";
import { formatBytes, formatTime } from "@/lib/brevilo/format";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { applyTheme } from "@/lib/brevilo/theme";

const subscribe = () => () => {};

export function ExplorePane({
  name,
  onOpen,
  onPrompt,
}: {
  name: string;
  onOpen: (view: ViewId) => void;
  onPrompt: (mode: ChatMode, prompt: string) => void;
}) {
  const cards: { title: string; body: string; view: ViewId }[] = [
    { title: "AI Assistant", body: "A focused chat that keeps context and writes in markdown.", view: "assistant" },
    { title: "Code studio", body: "Generate, debug, and tighten code in the languages you actually ship.", view: "code" },
    { title: "Files", body: "Upload a document and ask BREVILO to summarize or answer from it.", view: "files" },
    { title: "Themes", body: "Switch light or dark and set the accent that follows you.", view: "themes" },
  ];
  return (
    <section className="rise min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Studio</p>
          <h1 className="display mt-1 text-3xl font-bold">Welcome back{name ? `, ${name}` : ""}.</h1>
          <p className="mt-2 max-w-2xl text-muted">Start a conversation, open the code studio, or pick up a file. Everything here is saved to your account.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <button key={card.title} type="button" className="glass press rounded-xl p-5 text-left" onClick={() => onOpen(card.view)}>
              <h2 className="display text-xl font-bold">{card.title}</h2>
              <p className="mt-2 text-sm text-muted">{card.body}</p>
            </button>
          ))}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-muted">Suggested prompts</h2>
          <div className="mt-3 grid gap-2">
            {[
              ["assistant", "Summarize the tradeoffs of a weekly planning ritual"],
              ["assistant", "Help me write a concise status update"],
              ["code", "Show a safe pattern for parameterized SQL in PHP"],
              ["code", "Explain this stack trace and the likely fix"],
            ].map(([mode, prompt]) => (
              <button
                key={prompt}
                type="button"
                className="nav-item press"
                onClick={() => onPrompt(mode === "code" ? "code" : "assistant", prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FilesPane({
  onUse,
}: {
  onUse: (file: Attachment, prompt: string) => void;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [question, setQuestion] = useState("What are the key points in this file?");

  async function refresh() {
    setLoading(true);
    try {
      setFiles(await listAttachments());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load files.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onUpload(list: FileList | null) {
    if (!list?.length) return;
    const { uploadAttachment } = await import("@/lib/brevilo/data");
    for (const file of Array.from(list)) {
      if (file.size > 2_000_000) {
        toast.error(`${file.name} is over 2 MB.`);
        continue;
      }
      try {
        const dataBase64 = await readBase64(file);
        await uploadAttachment({
          data: { filename: file.name, mime: file.type || "application/octet-stream", dataBase64 },
        });
        toast.success(`${file.name} uploaded`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      }
    }
    await refresh();
  }

  return (
    <section className="rise min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">Library</p>
            <h1 className="display text-3xl font-bold">Files</h1>
            <p className="mt-2 text-muted">TXT, PDF, DOCX, CSV, JSON, and source files. Up to 2 MB each.</p>
          </div>
          <label className="btn btn-primary press">
            Upload
            <input
              className="sr-only"
              type="file"
              multiple
              accept=".txt,.pdf,.docx,.csv,.json,.js,.ts,.tsx,.jsx,.py,.php,.java,.c,.cpp,.h,.hpp,.css,.html,.sql,.md,.sk,.skript"
              onChange={(event) => {
                void onUpload(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {loading ? (
          <p className="flex items-center gap-2 text-muted"><span className="spin" /> Loading files</p>
        ) : files.length === 0 ? (
          <div className="glass rounded-xl p-8 text-muted">No files yet. Upload one and ask BREVILO about it.</div>
        ) : (
          <ul className="grid gap-3">
            {files.map((file) => {
              const open = openId === file.id;
              return (
                <li key={file.id} className="glass rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-1 shrink-0 text-glow" size={18} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{file.filename}</p>
                      <p className="text-sm text-subtle">{formatBytes(file.sizeBytes)} · {formatTime(file.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${file.filename}`}
                      onClick={() => {
                        void deleteAttachment({ data: file.id })
                          .then(() => {
                            toast.success("File removed");
                            setFiles((current) => current.filter((item) => item.id !== file.id));
                          })
                          .catch(() => toast.error("Couldn't remove that file."));
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ghost press" onClick={() => setOpenId(open ? null : file.id)}>
                      {open ? "Hide preview" : "Preview"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost press"
                      onClick={() => onUse(file, "Summarize this file. Lead with the point, then list the important details.")}
                    >
                      Summarize
                    </button>
                  </div>
                  {open ? (
                    <div className="mt-3 grid gap-3">
                      <pre className="max-h-64 overflow-auto rounded-lg bg-elev-2 p-3 text-sm whitespace-pre-wrap text-muted">
                        {file.preview || "No readable text found in this file. You can still ask, and BREVILO will say so."}
                      </pre>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input className="field" value={question} onChange={(event) => setQuestion(event.target.value)} />
                        <button type="button" className="btn btn-primary press" onClick={() => onUse(file, question)}>
                          Ask
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function SettingsPane({
  profile,
  email,
  onSave,
  onClear,
}: {
  profile: Profile;
  email: string | null;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onClear: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const gate = useSyncExternalStore(subscribe, hasGateSessionMarker, () => false);
  useEffect(() => setName(profile.displayName), [profile.displayName]);
  return (
    <section className="rise min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Account</p>
          <h1 className="display text-3xl font-bold">Settings</h1>
        </div>
        <form
          className="glass grid gap-3 rounded-xl p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave({ displayName: name });
          }}
        >
          <h2 className="font-semibold">Profile</h2>
          <label className="grid gap-1 text-sm text-muted">
            Display name
            <input className="field" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} />
          </label>
          <p className="text-sm text-subtle">{email || "No email on this session"}</p>
          <button type="submit" className="btn btn-primary press w-fit">Save name</button>
        </form>
        <div className="glass grid gap-3 rounded-xl p-5">
          <h2 className="font-semibold">Chat</h2>
          <label className="flex items-center justify-between gap-3 text-sm">
            Enter key sends
            <input
              type="checkbox"
              checked={profile.enterToSend}
              onChange={(event) => void onSave({ enterToSend: event.target.checked })}
            />
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Response length
            <select
              className="field"
              value={profile.responseStyle}
              onChange={(event) => void onSave({ responseStyle: event.target.value as ResponseStyle })}
            >
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
        </div>
        <div className="glass grid gap-3 rounded-xl p-5">
          <h2 className="font-semibold">History</h2>
          <p className="text-sm text-muted">Remove every conversation and uploaded file on this account.</p>
          <button type="button" className="btn btn-ghost press w-fit text-danger" onClick={onClear}>
            Clear chat history
          </button>
        </div>
        {authEnabled && !gate ? (
          <div className="glass grid gap-3 rounded-xl p-5">
            <h2 className="font-semibold">Session</h2>
            <button
              type="button"
              className="btn btn-ghost press w-fit"
              onClick={() => {
                void signOut("/").catch(() => toast.error("Couldn't sign out. Try again."));
              }}
            >
              Log out
            </button>
          </div>
        ) : (
          <p className="text-sm text-subtle">This session stays signed in with your Grok account.</p>
        )}
      </div>
    </section>
  );
}

export function ThemesPane({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: ProfilePatch) => Promise<void>;
}) {
  const [custom, setCustom] = useState(profile.accent);
  useEffect(() => setCustom(profile.accent), [profile.accent]);
  function choose(theme: ThemeName) {
    applyTheme({ theme });
    void onSave({ theme });
  }
  return (
    <section className="rise min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Appearance</p>
          <h1 className="display text-3xl font-bold">Themes</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              data-active={profile.theme === theme}
              className="nav-item press h-auto flex-col items-start gap-1 px-4 py-4"
              onClick={() => choose(theme)}
            >
              <span className="font-semibold capitalize">{theme}</span>
              <span className="text-sm text-muted">{theme === "dark" ? "Navy studio" : "Daylight studio"}</span>
            </button>
          ))}
        </div>
        <div className="glass grid gap-3 rounded-xl p-5">
          <h2 className="font-semibold">Accent</h2>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3"
                onClick={() => {
                  applyTheme({ accent: preset.value });
                  void onSave({ accent: preset.value });
                }}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: preset.value }} />
                {preset.label}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyTheme({ accent: custom });
              void onSave({ accent: custom });
            }}
          >
            <input
              className="field w-36"
              value={custom}
              aria-label="Custom accent color"
              onChange={(event) => setCustom(event.target.value)}
            />
            <input
              type="color"
              aria-label="Pick accent color"
              value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : profile.accent}
              onChange={(event) => setCustom(event.target.value)}
            />
            <button type="submit" className="btn btn-primary press">Apply</button>
          </form>
          <p className="text-sm" style={{ color: "var(--color-accent)" }}>Accent preview — buttons and focus follow this color.</p>
        </div>
      </div>
    </section>
  );
}

export function AboutPane() {
  return (
    <section className="rise min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">Product</p>
        <h1 className="display text-3xl font-bold">About BREVILO</h1>
        <p className="text-muted">
          BREVILO is a private AI studio for conversation, code, and documents. Chats, files, and preferences stay on your account.
        </p>
        <div className="glass grid gap-3 rounded-xl p-5 text-sm leading-6">
          <p>Replies stream from a server-side model. The provider key never ships to the browser.</p>
          <p>The code studio covers HTML, CSS, JavaScript, PHP, MySQL, Python, Java, C, C++, and Minecraft Skript.</p>
          <p>Supported uploads: TXT, PDF, DOCX, CSV, JSON, and common source files. BREVILO reads the text it can extract, then answers from that text.</p>
          <p>Search looks through titles and message text. Rename or delete any conversation from the sidebar.</p>
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
