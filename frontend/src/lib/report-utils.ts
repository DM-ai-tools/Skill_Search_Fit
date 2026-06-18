import type { Output } from "@/lib/types";

export function getOutputMarkdown(output: Output | { generated_output: Record<string, unknown> }): string {
  const generated = output.generated_output;
  if (typeof generated?.markdown === "string") return generated.markdown;
  return JSON.stringify(generated, null, 2);
}
