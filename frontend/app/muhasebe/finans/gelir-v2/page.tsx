import GGProvider from "@/app/finans/gelir-gider-v2/GGProvider";
import GelirGiderListClient from "@/app/finans/gelir-gider-v2/GelirGiderListClient";

export default function MuhasebeGelirV2Page() {
  return (
    <GGProvider>
      <GelirGiderListClient modul="gelir" />
    </GGProvider>
  );
}
