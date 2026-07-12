import type { ComponentType } from 'react';
import type { Metadata } from 'next';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { SITE_TAB_TITLE } from '@/lib/landing-theme';
import YasalShellClient from '@/components/landing/yasal/YasalShellClient';
import { getLandingPageData } from '@/lib/landing-page-data';

export async function buildYasalStaticMetadata(
  path: string,
  description: string,
): Promise<Metadata> {
  const data = await getLandingPageData();
  const base = buildLandingMetadata(data, path);
  return {
    ...base,
    title: SITE_TAB_TITLE,
    description,
  };
}

export async function renderYasalStaticPage(Content: ComponentType) {
  const initialData = await getLandingPageData();
  return (
    <YasalShellClient initialData={initialData}>
      <Content />
    </YasalShellClient>
  );
}
