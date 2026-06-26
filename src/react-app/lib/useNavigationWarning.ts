import { useEffect, useCallback } from "react";
import { useBlocker } from "react-router-dom";

export function useNavigationWarning(isDirty: boolean) {
  // POP navigations (browser back/forward) to history entries outside the router
  // cannot be blocked — React Router warns and silently no-ops. Exclude them here;
  // the beforeunload handler below covers the page-exit case instead.
  const blocker = useBlocker(
    useCallback(({ historyAction }: { historyAction: string }) => isDirty && historyAction !== "POP", [isDirty])
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("You have unsaved changes. Leave without saving?")) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, blocker.state]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
