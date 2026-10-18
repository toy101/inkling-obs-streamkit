import { useEffect, useState } from "react";

import { api } from "./api";
import type { Rule, Stage } from "./api";

type MatchupCatalogs = {
  rules: Rule[];
  stages: Stage[];
};

export function useMatchupCatalogs(enabled: boolean): MatchupCatalogs {
  const [catalogs, setCatalogs] = useState<MatchupCatalogs>({ rules: [], stages: [] });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      const [rules, stages] = await Promise.all([api.rules.get(), api.stages.get()]);
      if (cancelled) return;
      if (rules.error || stages.error) {
        console.error(rules.error ?? stages.error);
        return;
      }
      setCatalogs({ rules: rules.data, stages: stages.data });
    };

    void load();
    return () => { cancelled = true; };
  }, [enabled]);

  return catalogs;
}
