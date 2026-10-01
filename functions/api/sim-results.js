import { handleSimResults } from "../sim-results/logic.mjs";

export async function onRequestPost(context) {
  return handleSimResults(context.request, context.env);
}
