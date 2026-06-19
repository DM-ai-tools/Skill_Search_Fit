export interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
}

export interface Project {
  id: string;
  project_name: string;
  created_at: string;
  updated_at: string;
  output_count: number;
}

export interface Plugin {
  id: string;
  plugin_name: string;
  description: string;
  category: string;
  icon: string;
  schema_version: number;
  status: string;
  input_fields?: InputField[];
  output_template?: Record<string, unknown> | null;
  prompts?: { prompt_type: string; prompt_content: string }[];
}

export interface InputField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "url" | "checkbox";
  required?: boolean;
  placeholder?: string;
  help_text?: string;
  options?: { value: string; label: string }[];
}

export interface CompetitorDiscovery {
  domain: string;
  name: string;
  similarity_score: number;
  avg_position?: number | null;
  intersections?: number | null;
}

export interface WebsiteAnalysis {
  id: string;
  url: string;
  scan_status: "pending" | "scanning" | "completed" | "failed" | "partial";
  prefill_status?: "pending" | "generating" | "completed" | "failed" | null;
  cached?: boolean;
  analysis?: Record<string, unknown> & {
    quick_audit?: {
      summary?: string;
      overall_score?: number;
      strengths?: string[];
      issues?: Array<Record<string, unknown>>;
      priority_actions_30_days?: string[];
      quick_wins?: string[];
      suggested_plugin_inputs?: Record<string, unknown>;
    };
  };
  competitors?: CompetitorDiscovery[];
  competitor_discovery_status?: string;
  crawl?: { pages_crawled?: number; partial?: boolean };
  expires_at?: string;
}

export interface PluginAutofillResult {
  recommended_values: Record<string, unknown>;
  confidence_scores: Record<string, number>;
  reasoning: Record<string, string>;
  fields: Record<string, { value: unknown; confidence: number; suggestions?: string[] }>;
}

export interface ExecuteResponse {
  execution_id: string;
  status: string;
  output: {
    markdown: string;
    structured: Record<string, unknown>;
    execution_id?: string;
  };
  workflow_steps: { step: number; label: string; status: string }[];
}

export interface PipelineStep {
  plugin_name: string;
  label: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  icon: string;
  impact: number;
  steps: PipelineStep[];
  step_count: number;
}

export interface PipelineStepResult {
  step: number;
  plugin_id: string;
  plugin_name: string;
  label: string;
  execution_id: string;
  status: string;
  output_markdown: string;
  output?: {
    markdown?: string;
    structured?: Record<string, unknown>;
    execution_id?: string;
  };
  schema_version?: number;
}

export interface PipelineExecuteResponse {
  pipeline_id: string;
  pipeline_name: string;
  status: string;
  steps: PipelineStepResult[];
  combined_markdown: string;
  workflow_steps: { step: number; label: string; status: string }[];
}

export interface Output {
  id: string;
  project_id: string;
  plugin_id: string;
  plugin_name?: string;
  execution_id: string | null;
  input_snapshot: Record<string, unknown>;
  schema_version: number;
  generated_output: Record<string, unknown>;
  created_at: string;
}

export interface WorkspaceSession {
  id: string;
  plugin_id: string;
  plugin_name?: string;
  inputs: Record<string, unknown>;
  schema_version: number;
  notes: string;
  updated_at: string;
}

export interface AdminDashboardStats {
  total_active_users: number;
  total_projects: number;
  executions_last_7_days: number;
  new_signups_last_7_days: number;
  total_saved_outputs: number;
  top_plugins_last_30_days: {
    plugin_id: string;
    plugin_name: string;
    execution_count: number;
  }[];
}

export interface ActivityLog {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  timestamp: string;
  user_name: string | null;
  user_email: string | null;
}
