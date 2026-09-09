import { DocsPage } from "@/components/docs-page";
import { loadDocsPage } from "@/server/docs";

export const dynamic = "force-dynamic";

export default async function DocsRoute({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.doc) ? params.doc[0] : params.doc;
  const { current, menu } = await loadDocsPage(raw);
  return <DocsPage current={current} menu={menu} />;
}
