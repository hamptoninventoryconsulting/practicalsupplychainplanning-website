import { handleAsk } from "../email/logic.mjs";

export async function onRequestPost(context) {
  return handleAsk(context.request, context.env);
}
