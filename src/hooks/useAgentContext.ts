import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

export type AgentContext = {
  agentId: string;
  mccId: string;
  fullName: string;
  employeeCode: string;
  routeId: string | null;
  routeName: string | null;
};

/** Resolves the signed-in user's agent record and assigned route. */
export function useAgentContext() {
  const { data: user } = useCurrentUser();
  return useQuery<AgentContext | null>({
    queryKey: ["agent-context", user?.userId],
    enabled: Boolean(user?.userId),
    // A null result right after sign-in usually means the session token wasn't
    // attached yet — keep retrying briefly instead of caching "not linked".
    staleTime: (query) => (query.state.data ? 60_000 : 0),
    refetchInterval: (query) => (query.state.data ? false : 2_000),
    queryFn: async () => {
      const { data: agent } = await supabase
        .from("agents")
        .select("id, mcc_id, full_name, employee_code")
        .eq("profile_id", user!.userId)
        .maybeSingle();
      if (!agent) return null;

      const { data: route } = await supabase
        .from("routes")
        .select("id, name")
        .eq("assigned_agent_id", agent.id)
        .eq("active", true)
        .maybeSingle();

      return {
        agentId: agent.id,
        mccId: agent.mcc_id,
        fullName: agent.full_name,
        employeeCode: agent.employee_code,
        routeId: route?.id ?? null,
        routeName: route?.name ?? null,
      };
    },
  });
}
