import { handleUnsubscribe } from "../../sim-results/logic.mjs";

export async function onRequest(context) {
  return handleUnsubscribe(context.request, context.env);
}
