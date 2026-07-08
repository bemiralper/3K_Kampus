import GGProvider from "../gelir-gider-v2/GGProvider";
import GelirGiderListClient from "../gelir-gider-v2/GelirGiderListClient";

export default function GiderV2Page() {
  return (
    <GGProvider>
      <GelirGiderListClient modul="gider" />
    </GGProvider>
  );
}
