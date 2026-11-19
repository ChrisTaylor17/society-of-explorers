import { PromptAtlas } from "@/components/prompts/PromptAtlas";
import { FALLBACK_PROMPTS } from "@/lib/prompts/catalog";

export default function Home() {
  return <PromptAtlas initialPrompts={FALLBACK_PROMPTS} />;
}

