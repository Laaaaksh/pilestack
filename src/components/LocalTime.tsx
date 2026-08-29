"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's own locale/timezone without a
 * hydration mismatch: `toLocaleString()` depends on the runtime's locale and
 * timezone, which the server (container TZ, fixed locale) and the browser
 * (viewer's own settings) usually disagree on. SSR and the first client
 * render both emit the same locale-independent ISO string; only the
 * post-mount effect — which never runs during SSR — swaps it to the
 * localized version, so hydration always compares identical output.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [display, setDisplay] = useState(iso);

  useEffect(() => {
    // Intentional: this is the standard hydration-safe pattern for
    // locale/timezone-dependent output — render the deterministic value on
    // both the server and the first client pass, then swap to the real
    // localized value only once mounted, when SSR can no longer see it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplay(new Date(iso).toLocaleString());
  }, [iso]);

  return <span>{display}</span>;
}
