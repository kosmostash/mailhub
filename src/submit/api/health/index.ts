import { defineRoute } from "_/api";

export default defineRoute<"health">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("health route starts here - replace this response with real logic.");
  }),
]);
