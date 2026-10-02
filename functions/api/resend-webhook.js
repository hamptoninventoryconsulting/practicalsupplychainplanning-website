import { handleResendWebhook } from "../email/logic.mjs";

export async function onRequestPost(context) {
  return handleResendWebhook(context.request, context.env);
}
