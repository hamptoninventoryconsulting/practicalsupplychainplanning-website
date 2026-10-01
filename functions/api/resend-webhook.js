import { handleResendWebhook } from "../sim-results/logic.mjs";

export async function onRequestPost(context) {
  return handleResendWebhook(context.request, context.env);
}
