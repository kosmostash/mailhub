import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "🚀 Success! A fresh React route is ready to roll.",
    routeName: "account",
    pathMap: {
      page: "~/pages/account/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
