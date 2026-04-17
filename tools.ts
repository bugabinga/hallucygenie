// HallucyGenie tools - placeholder for HG-004

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function getToolDefinitions(): ToolDefinition[] {
  return [];
}
