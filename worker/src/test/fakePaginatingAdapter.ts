import type { DiscoverResult, LeadSourceAdapter, RawLead, SourceContext } from "../sources/types.js";

/**
 * A LeadSourceAdapter that only ever yields one page per discover() call, honoring
 * context.cursor as a page index — proves the framework's continuation-task contract
 * without needing a real paginated network API.
 */
export function createFakePaginatingAdapter(pages: RawLead[][]): LeadSourceAdapter {
  return {
    sourceType: "fake-paginating",
    async *discover(_query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void> {
      const pageIndex = context.cursor ? Number(context.cursor) : 0;
      const page = pages[pageIndex] ?? [];
      for (const lead of page) {
        yield lead;
      }
      const nextIndex = pageIndex + 1;
      const hasMore = nextIndex < pages.length;
      return { cursor: hasMore ? String(nextIndex) : null };
    },
  };
}
