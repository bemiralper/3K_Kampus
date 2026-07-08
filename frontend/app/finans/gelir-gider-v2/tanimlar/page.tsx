import GGProvider from "../GGProvider";
import TanimlarClient from "../TanimlarClient";

export default function FinansmanTanimlariPage() {
  return (
    <GGProvider>
      <TanimlarClient />
    </GGProvider>
  );
}
