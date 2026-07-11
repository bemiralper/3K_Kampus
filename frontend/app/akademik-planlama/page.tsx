import AkademikOperasyonHome from "@/components/akademik/AkademikOperasyonHome";
import { AKADEMIK_MODULE_LABEL } from "@/lib/akademik-routes";

export const metadata = {
  title: `${AKADEMIK_MODULE_LABEL} | 3K Kampüs`,
};

export default function AkademikOperasyonPage() {
  return <AkademikOperasyonHome />;
}
