import { defineRoute } from "_/api";

export default defineRoute<"operators/[id]/reassign">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("operators/[id]/reassign route starts here - replace this response with real logic.");
  }),
]);
