import { defineRoute } from "_/api";

export default defineRoute<"emails/actions/test-send">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("emails/actions/test-send route starts here - replace this response with real logic.");
  }),
]);
