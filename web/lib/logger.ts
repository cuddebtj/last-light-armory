// Structured console logging usable from both server (lib/data.ts during
// build/SSR) and client (components' catch blocks, error boundaries) code
// — this app has no backend to ship logs to (static export, zero
// environment variables by design), so the console *is* the log
// destination: Vercel's build/function output on the server side, the
// visitor's (or your own, in dev) devtools on the client side.
//
// debug/info are dev-only noise reduction; warn/error always emit, since
// those are exactly the "something's wrong and I want to see it, even in
// a production visitor's console" signal this exists for.
type LogLevel = "debug" | "info" | "warn" | "error";

const isProduction = process.env.NODE_ENV === "production";

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (isProduction && (level === "debug" || level === "info")) return;

  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const args: unknown[] = context === undefined ? [prefix, message] : [prefix, message, context];

  switch (level) {
    case "debug":
      console.debug(...args);
      break;
    case "info":
      console.info(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
      console.error(...args);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
