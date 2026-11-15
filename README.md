# BREVILO

Private AI studio for conversation, code, and documents.

## What you get

- Signed-in chat with streaming replies, markdown, and highlighted code
- Code studio for HTML, CSS, JavaScript, PHP, MySQL, Python, Java, C, C++, and Skript
- File library for TXT, PDF, DOCX, CSV, JSON, and source files
- Search, rename, and delete for conversation history
- Profile, theme, accent, and response preferences

## Stack

The live app is a React interface with server functions and Postgres. Accounts use the built-in session system. The model key stays on the server (`XAI_API_KEY`) and is never sent to the browser.

Schema: [migrations/0001_auth.sql](migrations/0001_auth.sql) and [migrations/0002_brevilo.sql](migrations/0002_brevilo.sql).

## AI

Replies are requested from the server route `src/routes/api/chat.ts`, which calls the xAI chat API with model `grok-4.5`. If the server key is missing, the studio shows a clear unavailable state instead of inventing replies.

## Layout

- `src/routes` — pages and the chat stream route
- `src/components/brevilo` — interface
- `src/lib/brevilo` — data access, file extraction, streaming
- `migrations` — database schema
