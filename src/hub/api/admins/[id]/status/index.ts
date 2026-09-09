import { defineRoute } from "_/api";

export default defineRoute<"admins/[id]/status">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("admins/[id]/status route starts here - replace this response with real logic.");
  }),
]);
