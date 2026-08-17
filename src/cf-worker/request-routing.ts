export const routeAgentBeforeMcp = async (
  request: Request,
  routeAgent: () => Promise<Response | null>,
  routeMcp: () => Promise<Response>
): Promise<Response | null> => {
  const agentResponse = await routeAgent();
  if (agentResponse) return agentResponse;
  if (new URL(request.url).pathname === "/mcp") return routeMcp();
  return null;
};
