import { useSyncExternalStore, type CSSProperties } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { getServerSnapshot, getSnapshot, subscribeTheme } from "@/lib/brevilo/theme";
import appCss from "../styles.css?url";

const APP_NAME = "BREVILO";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "BREVILO is a private AI studio for chat, code, and documents." },
      { name: "theme-color", content: "#070a14" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const snap = useSyncExternalStore(subscribeTheme, getSnapshot, getServerSnapshot);
  const [theme, accent] = snap.split("|");
  return (
    <html lang="en" data-theme={theme} style={{ "--color-accent": accent } as CSSProperties} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('brevilo-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var a=localStorage.getItem('brevilo-accent');if(a&&/^#[0-9a-fA-F]{6}$/.test(a))document.documentElement.style.setProperty('--color-accent',a);}catch(e){}",
          }}
        />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
