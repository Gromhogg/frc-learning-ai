import type { Api, Model } from "@mariozechner/pi-ai";
import { ownKey, teamApiKey } from "./api-keys.ts";
import { FREE_AI_KEY, freeRoomLeft, freeUsedUpMessage, type FreeUse } from "./free-model.ts";
import { FREE_MODEL } from "../lib/config.ts";
import { modelIdFor, modelObject, providerOf, type AgentRole, type Provider } from "./models.ts";

// Which model and key a request runs on.
//
//   - Someone's own chats (web and Slack): their own key and model, if they
//     added one; else the team's choice for "Answers students".
//   - Everything else: the team's choice for that agent.

export interface AiSetup {
  model: Model<Api>;
  provider: Provider;
  apiKey: string;
  /** Runs on the person's own key (changes the error hints). */
  own: boolean;
}

/** The team's model and key for an agent. */
export async function teamAi(role: AgentRole): Promise<AiSetup> {
  const id = await modelIdFor(role);
  const provider = providerOf(id);
  if (provider !== "free") {
    const key = await teamApiKey(provider);
    if (key) return { model: modelObject(id), provider, apiKey: key, own: false };
  }
  return { model: modelObject(FREE_MODEL), provider: "free", apiKey: FREE_AI_KEY, own: false };
}

/** What one person's chats run on. */
export async function chatAi(userId: number): Promise<AiSetup> {
  const own = await ownKey(userId);
  if (own) return { model: modelObject(own.model), provider: providerOf(own.model), apiKey: own.key, own: true };
  return teamAi("tutor");
}

/** Why this can't run right now (the free model's daily limit), or null if it can. */
export async function whyNot(ai: AiSetup, use: FreeUse = "chat"): Promise<string | null> {
  if (ai.provider !== "free") return null;
  return (await freeRoomLeft(use)) ? null : freeUsedUpMessage();
}

/** Can a background job for this agent start now? */
export async function canRunInBackground(role: AgentRole): Promise<boolean> {
  return (await whyNot(await teamAi(role), "background")) === null;
}
