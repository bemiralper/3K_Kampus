import GGProvider from "@/app/finans/gelir-gider-v2/GGProvider";
import TanimlarClient from "@/app/finans/gelir-gider-v2/TanimlarClient";

export default function MuhasebeFinansmanTanimlariPage() {
  return (
    <GGProvider>
      <TanimlarClient />
    </GGProvider>
  );
}
