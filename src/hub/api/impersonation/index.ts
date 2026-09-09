import { defineRoute } from "_/api";

export default defineRoute<"impersonation">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("impersonation route starts here - replace this response with real logic.");
  }),
]);
