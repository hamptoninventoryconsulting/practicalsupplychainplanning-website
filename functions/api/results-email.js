import { handleResultsEmail } from "../email/logic.mjs";

export async function onRequestPost(context) {
  return handleResultsEmail(context.request, context.env);
}
