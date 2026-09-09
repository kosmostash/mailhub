import PageSample from "_/pageSamples/page.tsx";

export default function Page() {
  return PageSample({
    message: "🥳 Congrats! Your app just leveled up with a new React route.",
    routeName: "emails/[id]",
    pathMap: {
      page: "~/pages/emails/[id]/index.tsx",
      pages: "~/pages",
      api: "~/api",
    },
  });
}
