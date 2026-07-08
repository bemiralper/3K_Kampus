import GGProvider from "@/app/finans/gelir-gider-v2/GGProvider";
import RaporClient from "@/app/finans/gelir-gider-v2/RaporClient";

export default function MuhasebeGelirGiderRaporlarPage() {
  return (
    <GGProvider>
      <RaporClient />
    </GGProvider>
  );
}
