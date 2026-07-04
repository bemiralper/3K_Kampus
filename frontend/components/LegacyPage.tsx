import LegacyScripts from "@/components/LegacyScripts";
import { compileLegacyTemplate, renderLegacyTemplate } from "@/lib/legacyTemplate";

export default function LegacyPage({
  templatePath,
  data,
}: {
  templatePath: string;
  data?: Record<string, unknown>;
}) {
  const html = data ? renderLegacyTemplate(templatePath, data) : compileLegacyTemplate(templatePath);

  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
      <LegacyScripts />
    </>
  );
}
