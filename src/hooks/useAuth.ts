import { useState, useEffect, useCallback } from "react";
import { supabase, signIn as authSignIn, signOut as authSignOut } from "../services/auth";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await authSignIn(email, password);
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  return { session, user, loading, signIn, signOut };
}
