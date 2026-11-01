import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  daily_calorie_goal: number | null;
  unit_system: 'metric' | 'imperial';
  time_zone: string;
  ai_training_opt_in: boolean;
};

type ProfileState = {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState>({
  profile: null,
  isLoading: true,
  error: null,
  refresh: async () => {},
});

// Setup is done once the user has a name and a calorie goal
export function isProfileComplete(profile: Profile | null) {
  return !!profile?.display_name && !!profile.daily_calorie_goal;
}

// Loads the signed-in user's own profile row (row-level security only allows their own)
export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, display_name, daily_calorie_goal, unit_system, time_zone, ai_training_opt_in')
      .eq('id', userId)
      .single();
    setProfile(data as Profile | null);
    if (loadError) {
      console.warn('Profile load failed:', loadError.code, loadError.message);
      setError(`Could not load your profile (${loadError.code ?? 'unknown'}: ${loadError.message})`);
    } else {
      setError(null);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <ProfileContext value={{ profile, isLoading, error, refresh }}>{children}</ProfileContext>;
}

export function useProfile() {
  return use(ProfileContext);
}
