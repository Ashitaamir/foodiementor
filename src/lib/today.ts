import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type DayTotals = {
  log_date: string;
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  item_count: number;
  daily_calorie_goal: number | null;
};

export type DayLog = {
  id: string;
  eaten_at: string;
  food_name: string;
  food_source: string;
  grams: number;
  portion_label: string | null;
  portion_count: number | null;
  energy_kcal: number;
  meal_type: string | null;
  input_method: string;
};

// Today's totals and logged foods for the signed-in user (both worked out by the database)
export function useToday() {
  const [totals, setTotals] = useState<DayTotals | null>(null);
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [totalsResult, logsResult] = await Promise.all([
      supabase.rpc('daily_totals'),
      supabase.rpc('daily_logs'),
    ]);
    if (totalsResult.error || logsResult.error) {
      const problem = totalsResult.error ?? logsResult.error;
      console.warn('Loading today failed:', problem?.code, problem?.message);
      setError("Could not load today's food. Pull down to try again.");
    } else {
      setError(null);
      setTotals(((totalsResult.data as DayTotals[] | null) ?? [])[0] ?? null);
      setLogs((logsResult.data as DayLog[] | null) ?? []);
    }
    setIsLoading(false);
  }, []);

  return { totals, logs, isLoading, error, load };
}
