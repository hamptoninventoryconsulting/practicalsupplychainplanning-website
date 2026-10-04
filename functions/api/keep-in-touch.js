import { handleKeepInTouch } from "../email/logic.mjs";

export async function onRequestPost(context) {
  return handleKeepInTouch(context.request, context.env);
}
