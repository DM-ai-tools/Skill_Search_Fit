import { WorkspaceView } from "@/components/workspace/workspace-view";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspacePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};

  const projectRaw = query.project;
  const siteRaw = query.site_url;

  const projectId = typeof projectRaw === "string" ? projectRaw : undefined;
  const siteUrl = typeof siteRaw === "string" ? siteRaw : undefined;

  return <WorkspaceView pluginId={id} projectId={projectId} siteUrl={siteUrl} />;
}
