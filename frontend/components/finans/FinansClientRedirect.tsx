"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFinansPath } from "@/components/finans/FinansPathProvider";

interface FinansClientRedirectProps {
  segment: string;
  query?: string;
}

/** Muhasebe/admin basePath uyumlu client-side yönlendirme. */
export default function FinansClientRedirect({ segment, query }: FinansClientRedirectProps) {
  const { href } = useFinansPath();
  const router = useRouter();

  useEffect(() => {
    const target = href(segment) + (query ? `?${query}` : "");
    router.replace(target);
  }, [href, router, segment, query]);

  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
