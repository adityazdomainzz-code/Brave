import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Attachment, ChatMessage, Conversation, Profile, ProfilePatch } from "@/lib/brevilo/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCENT = /^#[0-9a-fA-F]{6}$/;

class InputError extends Error {}

function uuid(value: unknown, label: string) {
  if (typeof value !== "string" || !UUID.test(value)) throw new InputError(`Invalid ${label}.`);
  return value;
}

function mapProfile(row: {
  display_name: string;
  accent: string;
  theme: string;
  response_style: string;
  enter_to_send: boolean;
}): Profile {
  const responseStyle =
    row.response_style === "concise" || row.response_style === "detailed"
      ? row.response_style
      : "balanced";
  return {
    displayName: row.display_name ?? "",
    accent: ACCENT.test(row.accent) ? row.accent.toLowerCase() : "#6d4dff",
    theme: row.theme === "light" ? "light" : "dark",
    responseStyle,
    enterToSend: Boolean(row.enter_to_send),
  };
}

const profileColumns = {
  display_name: "",
  accent: "",
  theme: "",
  response_style: "",
  enter_to_send: false,
};
type ProfileRow = typeof profileColumns;

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InputError) throw err;
    if (err instanceof Error && (err.message === "Unauthorized" || err.name === "UnauthorizedError")) {
      throw err;
    }
    console.error(err);
    throw new Error("Something went wrong. Please try again.");
  }
}

export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((name: unknown) => (typeof name === "string" ? name.trim().slice(0, 80) : ""))
  .handler(async ({ data: suggested, context }) =>
    guard(async () => {
      const sql = await getSql();
      const rows = await sql<ProfileRow>`
        insert into profiles (user_id, display_name)
        values (${context.userId}, ${suggested})
        on conflict (user_id) do update
          set display_name = case
            when profiles.display_name = '' then excluded.display_name
            else profiles.display_name
          end
        returning display_name, accent, theme, response_style, enter_to_send
      `;
      if (!rows[0]) throw new Error("Could not load your profile.");
      return mapProfile(rows[0]);
    }),
  );

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((patch: unknown): ProfilePatch => {
    if (!patch || typeof patch !== "object") throw new InputError("Invalid settings.");
    const o = patch as Record<string, unknown>;
    const next: ProfilePatch = {};
    if ("displayName" in o) {
      if (typeof o.displayName !== "string") throw new InputError("Enter a display name.");
      const name = o.displayName.replace(/\s+/g, " ").trim().slice(0, 48);
      if (/[\u0000-\u001f]/.test(name)) throw new InputError("That name is not valid.");
      next.displayName = name;
    }
    if ("accent" in o) {
      if (typeof o.accent !== "string" || !ACCENT.test(o.accent)) {
        throw new InputError("Pick a hex color like #6d4dff.");
      }
      next.accent = o.accent.toLowerCase();
    }
    if ("theme" in o) {
      if (o.theme !== "dark" && o.theme !== "light") throw new InputError("Choose dark or light.");
      next.theme = o.theme;
    }
    if ("responseStyle" in o) {
      if (o.responseStyle !== "concise" && o.responseStyle !== "balanced" && o.responseStyle !== "detailed") {
        throw new InputError("Choose a response style.");
      }
      next.responseStyle = o.responseStyle;
    }
    if ("enterToSend" in o) {
      if (typeof o.enterToSend !== "boolean") throw new InputError("Invalid chat preference.");
      next.enterToSend = o.enterToSend;
    }
    return next;
  })
  .handler(async ({ data, context }) =>
    guard(async () => {
      const sql = await getSql();
      const current = await sql<{
        display_name: string;
        accent: string;
        theme: string;
        response_style: string;
        enter_to_send: boolean;
      }>`
        select display_name, accent, theme, response_style, enter_to_send
        from profiles where user_id = ${context.userId}
      `;
      const base = current[0]
        ? mapProfile(current[0])
        : {
            displayName: "",
            accent: "#6d4dff",
            theme: "dark" as const,
            responseStyle: "balanced" as const,
            enterToSend: true,
          };
      const merged: Profile = {
        displayName: data.displayName ?? base.displayName,
        accent: data.accent ?? base.accent,
        theme: data.theme ?? base.theme,
        responseStyle: data.responseStyle ?? base.responseStyle,
        enterToSend: data.enterToSend ?? base.enterToSend,
      };
      const rows = await sql<{
        display_name: string;
        accent: string;
        theme: string;
        response_style: string;
        enter_to_send: boolean;
      }>`
        insert into profiles (user_id, display_name, accent, theme, response_style, enter_to_send, updated_at)
        values (
          ${context.userId},
          ${merged.displayName},
          ${merged.accent},
          ${merged.theme},
          ${merged.responseStyle},
          ${merged.enterToSend},
          now()
        )
        on conflict (user_id) do update set
          display_name = excluded.display_name,
          accent = excluded.accent,
          theme = excluded.theme,
          response_style = excluded.response_style,
          enter_to_send = excluded.enter_to_send,
          updated_at = now()
        returning display_name, accent, theme, response_style, enter_to_send
      `;
      if (!rows[0]) throw new Error("Could not save settings.");
      return mapProfile(rows[0]);
    }),
  );

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export const listConversations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((q: unknown) => (typeof q === "string" ? q.trim().slice(0, 80) : ""))
  .handler(async ({ data: q, context }) =>
    guard(async () => {
      const sql = await getSql();
      const rows = q
        ? await sql<{ id: string; title: string; mode: string; updated_at: string }>`
            select c.id, c.title, c.mode,
              to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
            from conversations c
            where c.user_id = ${context.userId}
              and (
                c.title ilike ${likePattern(q)} escape '\\'
                or exists (
                  select 1 from messages m
                  where m.conversation_id = c.id
                    and m.user_id = c.user_id
                    and m.content ilike ${likePattern(q)} escape '\\'
                )
              )
            order by c.updated_at desc
            limit 80
          `
        : await sql<{ id: string; title: string; mode: string; updated_at: string }>`
            select id, title, mode,
              to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
            from conversations
            where user_id = ${context.userId}
            order by updated_at desc
            limit 80
          `;
      return rows.map(
        (row): Conversation => ({
          id: row.id,
          title: row.title,
          mode: row.mode === "code" ? "code" : "assistant",
          updatedAt: row.updated_at,
        }),
      );
    }),
  );

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new InputError("Invalid conversation.");
    const o = input as Record<string, unknown>;
    const id = uuid(o.id, "conversation");
    if (typeof o.title !== "string") throw new InputError("Enter a title.");
    const title = o.title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!title) throw new InputError("Enter a title.");
    return { id, title };
  })
  .handler(async ({ data, context }) =>
    guard(async () => {
      const sql = await getSql();
      const rows = await sql<{ id: string }>`
        update conversations
        set title = ${data.title}, updated_at = now()
        where id = ${data.id} and user_id = ${context.userId}
        returning id
      `;
      if (!rows[0]) throw new InputError("That conversation is gone.");
      return { ok: true as const };
    }),
  );

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => uuid(id, "conversation"))
  .handler(async ({ data: id, context }) =>
    guard(async () => {
      const sql = await getSql();
      await sql`delete from conversations where id = ${id} and user_id = ${context.userId}`;
      return { ok: true as const };
    }),
  );

export const clearHistory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    guard(async () => {
      const sql = await getSql();
      await sql`delete from conversations where user_id = ${context.userId}`;
      await sql`delete from attachments where user_id = ${context.userId}`;
      return { ok: true as const };
    }),
  );

export const listMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => uuid(id, "conversation"))
  .handler(async ({ data: id, context }) =>
    guard(async () => {
      const sql = await getSql();
      const owned = await sql<{ id: string }>`
        select id from conversations where id = ${id} and user_id = ${context.userId}
      `;
      if (!owned[0]) return [] as ChatMessage[];
      const rows = await sql<{
        id: string;
        role: string;
        content: string;
        created_at: string;
        attachment_note: string;
      }>`
        select id, role, content, attachment_note,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
        from messages
        where conversation_id = ${id} and user_id = ${context.userId}
        order by created_at asc, id asc
      `;
      return rows.map(
        (row): ChatMessage => ({
          id: row.id,
          role: row.role === "assistant" ? "assistant" : "user",
          content: row.content,
          createdAt: row.created_at,
          attachmentNote: row.attachment_note ?? "",
        }),
      );
    }),
  );

export const uploadAttachment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new InputError("Invalid file.");
    const o = input as Record<string, unknown>;
    if (typeof o.filename !== "string" || typeof o.dataBase64 !== "string") {
      throw new InputError("Invalid file.");
    }
    if (!o.filename.trim()) throw new InputError("That file needs a name.");
    if (o.dataBase64.length > 2_900_000) throw new InputError("Files must be 2 MB or smaller.");
    const mime = typeof o.mime === "string" ? o.mime.slice(0, 120) : "application/octet-stream";
    return { filename: o.filename.slice(0, 180), mime, dataBase64: o.dataBase64 };
  })
  .handler(async ({ data, context }) =>
    guard(async () => {
      const { ALLOWED_EXT, extractText, fileExt, safeName } = await import("@/lib/brevilo/extract.server");
      const filename = safeName(data.filename);
      const ext = fileExt(filename);
      if (!ALLOWED_EXT.has(ext)) throw new InputError("That file type is not supported.");
      const bytes = Buffer.from(data.dataBase64, "base64");
      if (!bytes.length) throw new InputError("That file is empty.");
      if (bytes.length > 2_000_000) throw new InputError("Files must be 2 MB or smaller.");
      const text = extractText(filename, bytes);
      const id = crypto.randomUUID();
      const sql = await getSql();
      await sql`
        insert into attachments (id, user_id, filename, mime, size_bytes, text_content)
        values (${id}, ${context.userId}, ${filename}, ${data.mime}, ${bytes.length}, ${text})
      `;
      const item: Attachment = {
        id,
        filename,
        mime: data.mime,
        sizeBytes: bytes.length,
        preview: text.slice(0, 1800),
        createdAt: new Date().toISOString(),
      };
      return item;
    }),
  );

export const listAttachments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    guard(async () => {
      const sql = await getSql();
      const rows = await sql<{
        id: string;
        filename: string;
        mime: string;
        size_bytes: number;
        preview: string;
        created_at: string;
      }>`
        select id, filename, mime, size_bytes,
          left(text_content, 1800) as preview,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
        from attachments
        where user_id = ${context.userId}
        order by created_at desc
        limit 40
      `;
      return rows.map(
        (row): Attachment => ({
          id: row.id,
          filename: row.filename,
          mime: row.mime,
          sizeBytes: Number(row.size_bytes),
          preview: row.preview ?? "",
          createdAt: row.created_at,
        }),
      );
    }),
  );

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => uuid(id, "file"))
  .handler(async ({ data: id, context }) =>
    guard(async () => {
      const sql = await getSql();
      await sql`delete from attachments where id = ${id} and user_id = ${context.userId}`;
      return { ok: true as const };
    }),
  );
