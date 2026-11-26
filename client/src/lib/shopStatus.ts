import { useQuery } from '@tanstack/react-query';

// What GET /api/shop-status returns (server/lib/shopStatus.js shopClosure).
export type ShopClosure =
  | { closed: false }
  | {
      closed: true;
      reopens_on: string | null;
      reopens_label: string | null;
      note: string | null;
      message: string;
    };

export const SHOP_STATUS_KEY = ['shop-status'] as const;

// The whole-shop closed switch. Cheap to call from anywhere: one shared
// query, re-read when the tab regains focus so a page left open over a
// holiday catches the change.
export function useShopClosure() {
  return useQuery<ShopClosure>({
    queryKey: SHOP_STATUS_KEY,
    queryFn: async () => {
      const r = await fetch('/api/shop-status');
      if (!r.ok) return { closed: false };
      return r.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
