import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

export function useNavigationWarning(isDirty: boolean) {
  const blocker = useBlocker(isDirty);

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
