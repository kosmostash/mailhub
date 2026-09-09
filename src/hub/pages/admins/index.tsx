import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "💫 Awesome! Another React route joins the lineup.",
    routeName: "admins",
    pathMap: {
      page: "~/pages/admins/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
