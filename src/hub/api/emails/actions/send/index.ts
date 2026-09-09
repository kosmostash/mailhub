import { defineRoute } from "_/api";

export default defineRoute<"emails/actions/send">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("emails/actions/send route starts here - replace this response with real logic.");
  }),
]);
