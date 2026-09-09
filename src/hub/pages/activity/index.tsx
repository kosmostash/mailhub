import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "🚀 Success! A fresh React route is ready to roll.",
    routeName: "activity",
    pathMap: {
      page: "~/pages/activity/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
