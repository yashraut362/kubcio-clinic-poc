"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiRequestError } from "@/lib/queries";

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session (created lazily so it isn't shared across server requests).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            // Don't retry client errors (403, 404, 422...); retry network/server errors once.
            retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
