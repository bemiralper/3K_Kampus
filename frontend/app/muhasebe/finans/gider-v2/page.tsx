import GGProvider from "@/app/finans/gelir-gider-v2/GGProvider";
import GelirGiderListClient from "@/app/finans/gelir-gider-v2/GelirGiderListClient";

export default function MuhasebeGiderV2Page() {
  return (
    <GGProvider>
      <GelirGiderListClient modul="gider" />
    </GGProvider>
  );
}
