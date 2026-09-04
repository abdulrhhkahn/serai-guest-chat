import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // A modest default staleTime cuts down on redundant refetches across
  // the app (the actual "lightweight load" lever, distinct from
  // persistence) — safe globally because anything time-sensitive
  // (Inbox, active chat) has its own realtime subscription correcting
  // it immediately regardless of what this says.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
