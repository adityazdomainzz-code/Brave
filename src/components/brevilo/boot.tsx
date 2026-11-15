import { Logo, Wordmark } from "@/components/brevilo/logo";

export function BootScreen({ label = "Preparing your studio" }: { label?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={52} />
        <Wordmark />
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="spin" />
          {label}
        </p>
      </div>
    </main>
  );
}
