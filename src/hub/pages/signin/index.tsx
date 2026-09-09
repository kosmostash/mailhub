import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "🎯 Nailed it! A brand new React route just landed.",
    routeName: "signin",
    pathMap: {
      page: "~/pages/signin/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
