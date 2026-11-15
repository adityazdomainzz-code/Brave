import { useEffect, useRef, useState } from "react";
import {
  Code2,
  Compass,
  Info,
  Menu,
  MessageSquare,
  Palette,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type { AppUser } from "@/lib/auth/use-current-user";
import { authClient } from "@/lib/auth/client";
import {
  clearHistory,
  deleteConversation,
  ensureProfile,
  listConversations,
  renameConversation,
  updateProfile,
} from "@/lib/brevilo/data";
import { applyTheme, readTheme } from "@/lib/brevilo/theme";
import type { ChatMode, Conversation, Profile, ProfilePatch, ViewId } from "@/lib/brevilo/types";
import { cn } from "@/lib/brevilo/format";
import { Logo, Wordmark } from "@/components/brevilo/logo";
import { ChatPane, type Launch } from "@/components/brevilo/chat-pane";
import { AboutPane, ExplorePane, FilesPane, SettingsPane, ThemesPane } from "@/components/brevilo/panels";

const NAV: { id: ViewId; label: string; icon: typeof MessageSquare }[] = [
  { id: "assistant", label: "AI Assistant", icon: MessageSquare },
  { id: "code", label: "Code Assistant", icon: Code2 },
  { id: "files", label: "File Upload", icon: Paperclip },
  { id: "explore", label: "Explore Features", icon: Compass },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "about", label: "About BREVILO", icon: Info },
];

export function AppShell({ user }: { user: AppUser }) {
  const [view, setView] = useState<ViewId>("assistant");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [launchTick, setLaunchTick] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirm, setConfirm] = useState<null | { title: string; body: string; run: () => Promise<void> }>(null);
  const [profile, setProfile] = useState<Profile>({
    displayName: user.displayName ?? "",
    accent: "#6d4dff",
    theme: readTheme(),
    responseStyle: "balanced",
    enterToSend: true,
  });
  const queue = useRef<Launch | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancel = false;
    listConversations({ data: query })
      .then((rows) => {
        if (!cancel) setConversations(rows);
      })
      .catch(() => {
        if (!cancel) toast.error("Couldn't load chat history.");
      });
    return () => {
      cancel = true;
    };
  }, [query, revision]);

  useEffect(() => {
    let cancel = false;
    ensureProfile({ data: user.displayName ?? "" })
      .then((next) => {
        if (cancel) return;
        setProfile(next);
        applyTheme({ theme: next.theme, accent: next.accent });
      })
      .catch(() => {
        if (!cancel) toast.error("Couldn't load your profile.");
      });
    return () => {
      cancel = true;
    };
  }, [user.id, user.displayName]);

  async function refresh() {
    setRevision((value) => value + 1);
  }

  async function saveProfile(patch: ProfilePatch) {
    try {
      const next = await updateProfile({ data: patch });
      setProfile(next);
      applyTheme({ theme: next.theme, accent: next.accent });
      if (patch.displayName !== undefined && next.displayName) {
        try {
          await authClient.updateUser({ name: next.displayName });
        } catch {
          /* the studio name is still saved */
        }
      }
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    }
  }

  function openView(next: ViewId) {
    setView(next);
    setSidebar(false);
  }

  function startNew() {
    queue.current = null;
    setView(view === "code" ? "code" : "assistant");
    setActiveId(null);
    setSessionKey((value) => value + 1);
    setSidebar(false);
  }

  function launch(mode: ChatMode, prompt: string, extra?: Partial<Launch>) {
    queue.current = { mode, prompt, ...extra };
    setView(mode);
    setActiveId(null);
    setSessionKey((value) => value + 1);
    setLaunchTick((value) => value + 1);
    setSidebar(false);
  }

  const active = conversations.find((item) => item.id === activeId) ?? null;
  const chatMode: ChatMode = view === "code" ? "code" : "assistant";
  const showChat = view === "assistant" || view === "code";
  const scoped = active && active.mode === chatMode ? active : null;
  const name = profile.displayName || user.displayName || "Member";

  return (
    <div className="flex h-dvh overflow-hidden">
      <Toaster
        theme={profile.theme}
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-elev)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-line)",
          },
        }}
      />
      {sidebar ? (
        <button type="button" className="fixed inset-0 z-30 bg-black/50 md:hidden" aria-label="Close menu" onClick={() => setSidebar(false)} />
      ) : null}
      <aside
        className={cn(
          "glass fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col gap-3 border-y-0 border-l-0 p-3 transition-transform duration-200 md:static md:translate-x-0",
          sidebar ? "translate-x-0" : "-translate-x-full",
          collapsed && "md:w-20",
        )}
      >
        <div className="flex items-center gap-2 px-1">
          <Logo />
          <div className={cn("min-w-0", collapsed && "md:hidden")}>
            <Wordmark />
            <p className="text-xs text-subtle">AI studio</p>
          </div>
          <button type="button" className="icon-btn ml-auto hidden md:grid" aria-label="Collapse sidebar" onClick={() => setCollapsed((value) => !value)}>
            <PanelLeft size={18} />
          </button>
          <button type="button" className="icon-btn ml-auto md:hidden" aria-label="Close sidebar" onClick={() => setSidebar(false)}>
            <X size={18} />
          </button>
        </div>
        <button type="button" className="btn btn-primary press" onClick={startNew}>
          <Plus size={16} />
          <span className={cn(collapsed && "md:hidden")}>New chat</span>
        </button>
        <label className={cn("relative", collapsed && "md:hidden")}>
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
          <input
            className="field pl-9"
            placeholder="Search chats"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav className="grid gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-item press"
              data-active={view === item.id}
              onClick={() => openView(item.id)}
              title={item.label}
            >
              <item.icon size={18} />
              <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className={cn("min-h-0 flex-1 overflow-y-auto", collapsed && "md:hidden")}>
          <p className="px-2 py-2 text-xs font-medium tracking-wide text-subtle uppercase">History</p>
          {conversations.length === 0 ? (
            <p className="px-2 text-sm text-subtle">{query ? "No chats match that search." : "No conversations yet."}</p>
          ) : (
            <ul className="grid gap-1">
              {conversations.map((item) => (
                <li key={item.id} className="group flex items-center gap-1">
                  {editing === item.id ? (
                    <form
                      className="flex flex-1 gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void renameConversation({ data: { id: item.id, title: titleDraft } })
                          .then(() => {
                            setEditing(null);
                            toast.success("Renamed");
                            return refresh();
                          })
                          .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't rename."));
                      }}
                    >
                      <input className="field" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} autoFocus />
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="nav-item press min-w-0 flex-1"
                      data-active={item.id === activeId}
                      onClick={() => {
                        queue.current = null;
                        setActiveId(item.id);
                        setView(item.mode);
                        setSidebar(false);
                      }}
                    >
                      <span className="truncate">{item.title}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn h-9 w-9 md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Rename ${item.title}`}
                    onClick={() => {
                      setEditing(item.id);
                      setTitleDraft(item.title);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn h-9 w-9 md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Delete ${item.title}`}
                    onClick={() =>
                      setConfirm({
                        title: "Delete conversation?",
                        body: `"${item.title}" and its messages will be removed.`,
                        run: async () => {
                          await deleteConversation({ data: item.id });
                          if (activeId === item.id) {
                            setActiveId(null);
                            setSessionKey((value) => value + 1);
                          }
                          toast.success("Conversation deleted");
                          await refresh();
                        },
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="nav-item press mt-auto" onClick={() => openView("settings")}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className={cn("min-w-0 text-left", collapsed && "md:hidden")}>
            <span className="block truncate text-sm font-semibold text-fg">{name}</span>
            <span className="block truncate text-xs text-subtle">{user.primaryEmail || "Profile"}</span>
          </span>
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 py-2 md:hidden">
          <button type="button" className="icon-btn" aria-label="Open menu" onClick={() => setSidebar(true)}>
            <Menu size={18} />
          </button>
          <Wordmark />
        </div>
        {showChat ? (
          <ChatPane
            mode={chatMode}
            activeId={scoped?.id ?? null}
            sessionKey={sessionKey}
            launchTick={launchTick}
            peekLaunch={() => queue.current}
            clearLaunch={() => {
              queue.current = null;
            }}
            onBind={(id) => setActiveId(id)}
            onRefresh={async () => {
              await refresh();
            }}
            enterToSend={profile.enterToSend}
            title={scoped?.title ?? (chatMode === "code" ? "New code chat" : "New chat")}
            onClear={() => {
              if (!scoped) return;
              setConfirm({
                title: "Clear this conversation?",
                body: "This deletes the chat and its messages.",
                run: async () => {
                  await deleteConversation({ data: scoped.id });
                  setActiveId(null);
                  setSessionKey((value) => value + 1);
                  toast.success("Conversation cleared");
                  await refresh();
                },
              });
            }}
          />
        ) : null}
        {view === "explore" ? (
          <ExplorePane name={name} onOpen={openView} onPrompt={(mode, prompt) => launch(mode, prompt)} />
        ) : null}
        {view === "files" ? (
          <FilesPane
            onUse={(file, prompt) =>
              launch("assistant", prompt, { attachmentIds: [file.id], attachmentNote: file.filename })
            }
          />
        ) : null}
        {view === "settings" ? (
          <SettingsPane
            profile={profile}
            email={user.primaryEmail}
            onSave={saveProfile}
            onClear={() =>
              setConfirm({
                title: "Clear all history?",
                body: "Every conversation and uploaded file on this account will be deleted.",
                run: async () => {
                  await clearHistory();
                  setActiveId(null);
                  setSessionKey((value) => value + 1);
                  toast.success("History cleared");
                  await refresh();
                },
              })
            }
          />
        ) : null}
        {view === "themes" ? <ThemesPane profile={profile} onSave={saveProfile} /> : null}
        {view === "about" ? <AboutPane /> : null}
      </div>
      {confirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <div className="glass w-full max-w-sm rounded-xl p-5" role="dialog" aria-modal="true">
            <h2 className="display text-xl font-bold">{confirm.title}</h2>
            <p className="mt-2 text-sm text-muted">{confirm.body}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost press" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary press"
                onClick={() => {
                  const job = confirm.run();
                  setConfirm(null);
                  void job.catch((err) => toast.error(err instanceof Error ? err.message : "That action failed."));
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
