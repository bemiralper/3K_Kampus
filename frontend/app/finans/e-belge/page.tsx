import GGProvider from "../gelir-gider-v2/GGProvider";
import UyumsoftAyarClient from "./UyumsoftAyarClient";

export default function EBelgeAyarPage() {
  return (
    <GGProvider>
      <UyumsoftAyarClient />
    </GGProvider>
  );
}
