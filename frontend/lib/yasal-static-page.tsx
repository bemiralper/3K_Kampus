import type { ComponentType } from "react";
import type { Metadata } from "next";
import { fetchLandingData } from "@/lib/website-api";
import { buildLandingMetadata } from "@/lib/landing-seo";
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from "@/lib/landing-theme";
import YasalShellClient from "@/components/landing/yasal/YasalShellClient";

export async function buildYasalStaticMetadata(
  path: string,
  description: string,
): Promise<Metadata> {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  const base = buildLandingMetadata(data, path);
  return {
    ...base,
    title: SITE_TAB_TITLE,
    description,
  };
}

export async function renderYasalStaticPage(Content: ComponentType) {
  const initialData = await fetchLandingData(LANDING_KURUM_KOD);
  return (
    <YasalShellClient initialData={initialData}>
      <Content />
    </YasalShellClient>
  );
}
