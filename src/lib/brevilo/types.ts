export type ThemeName = "dark" | "light";
export type ResponseStyle = "concise" | "balanced" | "detailed";
export type ChatMode = "assistant" | "code";
export type ViewId = ChatMode | "files" | "explore" | "settings" | "themes" | "about";

export type Profile = {
  displayName: string;
  accent: string;
  theme: ThemeName;
  responseStyle: ResponseStyle;
  enterToSend: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  mode: ChatMode;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachmentNote: string;
};

export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  preview: string;
  createdAt: string;
};

export type ProfilePatch = {
  displayName?: string;
  accent?: string;
  theme?: ThemeName;
  responseStyle?: ResponseStyle;
  enterToSend?: boolean;
};

export const CODE_LANGS = [
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "javascript", label: "JavaScript" },
  { id: "php", label: "PHP" },
  { id: "mysql", label: "MySQL" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "skript", label: "Skript" },
] as const;

export const ACCENT_PRESETS = [
  { id: "violet", label: "Violet", value: "#6d4dff" },
  { id: "azure", label: "Azure", value: "#3d7eff" },
  { id: "cyan", label: "Cyan", value: "#14b8d4" },
  { id: "iris", label: "Iris", value: "#8b5cf6" },
  { id: "teal", label: "Teal", value: "#0f9f8f" },
] as const;
