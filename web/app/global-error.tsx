"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { logger } from "@/lib/logger";

// Catches errors in the root layout itself — rare, but if it happens
// error.tsx can't help (it doesn't wrap layout.tsx), so this replaces the
// entire root layout and must bring its own <html>/<body> and styling
// rather than relying on globals.css or the fonts layout.tsx loads.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logger.error("uncaught root layout error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#a1a1aa" }}>
          {error.digest
            ? `An unexpected error occurred (ref: ${error.digest}).`
            : "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{
            marginTop: "1.5rem",
            fontSize: "0.875rem",
            color: "#eab308",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
