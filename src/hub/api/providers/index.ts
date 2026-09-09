import { defineRoute } from "_/api";

export default defineRoute<"providers">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("providers route starts here - replace this response with real logic.");
  }),
]);
