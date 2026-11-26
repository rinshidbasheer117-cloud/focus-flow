import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches every required FocusBeat page instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const routes = [
      ["/", "/_authenticated/"],
      ["/tasks", "/_authenticated/tasks"],
      ["/focus", "/_authenticated/focus"],
      ["/music", "/_authenticated/music"],
      ["/progress", "/_authenticated/progress"],
      ["/settings", "/_authenticated/settings"],
      ["/plus", "/_authenticated/plus"],
      ["/auth", "/auth"],
      ["/reset-password", "/reset-password"],
    ] as const;

    for (const [path, expectedRouteId] of routes) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId, `${path} should match ${expectedRouteId}`).toBe(expectedRouteId);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    }
  });
});
