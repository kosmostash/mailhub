import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "🎯 Nailed it! A brand new React route just landed.",
    routeName: "operators",
    pathMap: {
      page: "~/pages/operators/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
