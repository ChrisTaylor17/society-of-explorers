import type { Metadata } from "next";
import { PromptAtlas } from "@/components/prompts/PromptAtlas";
import { FALLBACK_PROMPTS } from "@/lib/prompts/catalog";
import {
  DEFAULT_SHARE_DESCRIPTION,
  DEFAULT_SHARE_TITLE,
  findPublicPromptForShare,
  normalizePromptKey,
  promptsForShare,
} from "@/lib/prompts/share";

interface PromptSharePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PromptSharePageProps): Promise<Metadata> {
  const { slug } = await params;
  const prompt = await findPublicPromptForShare(slug);
  const key = prompt?.slug || normalizePromptKey(slug);
  const canonical = key ? `/p/${encodeURIComponent(key)}` : "/";
  const image = key ? `/p/${encodeURIComponent(key)}/opengraph-image` : "/opengraph-image";
  const title = prompt ? `${prompt.title} | Prompt Atlas` : DEFAULT_SHARE_TITLE;
  const description = prompt?.description || DEFAULT_SHARE_DESCRIPTION;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Prompt Atlas by Society of Explorers",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PromptSharePage({ params }: PromptSharePageProps) {
  const { slug } = await params;
  const key = normalizePromptKey(slug);
  return <PromptAtlas initialPrompts={key ? promptsForShare(key) : FALLBACK_PROMPTS} />;
}
