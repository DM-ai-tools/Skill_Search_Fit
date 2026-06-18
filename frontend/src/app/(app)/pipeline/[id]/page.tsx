import { PipelineView } from "@/components/pipelines/pipeline-view";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PipelinePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};

  const projectRaw = query.project;
  const siteRaw = query.site_url;

  const projectId = typeof projectRaw === "string" ? projectRaw : undefined;
  const siteUrl = typeof siteRaw === "string" ? siteRaw : undefined;

  return <PipelineView pipelineId={id} projectId={projectId} siteUrl={siteUrl} />;
}
