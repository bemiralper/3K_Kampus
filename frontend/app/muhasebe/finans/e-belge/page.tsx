import GGProvider from "@/app/finans/gelir-gider-v2/GGProvider";
import UyumsoftAyarClient from "@/app/finans/e-belge/UyumsoftAyarClient";

export default function MuhasebeEBelgeAyarPage() {
  return (
    <GGProvider>
      <UyumsoftAyarClient />
    </GGProvider>
  );
}
