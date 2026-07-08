import GGProvider from "../gelir-gider-v2/GGProvider";
import GelirGiderListClient from "../gelir-gider-v2/GelirGiderListClient";

export default function GelirV2Page() {
  return (
    <GGProvider>
      <GelirGiderListClient modul="gelir" />
    </GGProvider>
  );
}
