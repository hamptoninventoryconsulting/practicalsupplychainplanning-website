import { handleUnsubscribe } from "./email/logic.mjs";

export async function onRequest(context) {
  return handleUnsubscribe(context.request, context.env);
}
