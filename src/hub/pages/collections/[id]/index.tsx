import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "🌟 Nice work! Another React route added to your app.",
    routeName: "collections/[id]",
    pathMap: {
      page: "~/pages/collections/[id]/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
