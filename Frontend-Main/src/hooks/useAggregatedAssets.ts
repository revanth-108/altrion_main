import { useMemo } from 'react';
import type { Asset, AssetType } from '@/types';

export interface AggregatedAsset {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  value: number;
  price: number;
  change24h: number;
  platforms: string[];
  type: AssetType;
}

const ASSET_NAME_FALLBACKS: Record<string, string> = {
  BTC: 'Bitcoin',
  USDC: 'USD Coin',
};

function isGarbageAssetLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^[0-9a-f]{16,}$/i.test(trimmed)) return true;
  if (/^0x[0-9a-f]{8,}$/i.test(trimmed)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
  if (trimmed.length > 32 && !/\s/.test(trimmed)) return true;
  return false;
}

function cleanAssetLabel(symbol: string, name: string): string {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const trimmedName = name.trim();
  const fallback = ASSET_NAME_FALLBACKS[normalizedSymbol];

  if (!trimmedName) {
    return fallback ?? 'Unlabeled Asset';
  }

  if (trimmedName.toUpperCase() === normalizedSymbol) {
    return fallback ?? normalizedSymbol;
  }

  if (isGarbageAssetLabel(trimmedName)) {
    return fallback ?? 'Custom Asset';
  }

  const cleaned = trimmedName
    .replace(/^0x/i, '')
    .replace(/[_:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || isGarbageAssetLabel(cleaned)) {
    return fallback ?? 'Custom Asset';
  }

  return cleaned
    .split(' ')
    .map((part) => (part.length <= 5 && /^[A-Z0-9]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ');
}

export function useAggregatedAssets(assets: Asset[]): AggregatedAsset[] {
  return useMemo(() => {
    const assetMap = new Map<string, AggregatedAsset>();

    assets.forEach(asset => {
      const key = `${asset.symbol}:${asset.type}`;
      const existing = assetMap.get(key);
      const platforms = asset.platform.split(', ').filter(Boolean);

      if (existing) {
        existing.amount += asset.amount;
        existing.value += asset.value;
        platforms.forEach(platform => {
          if (!existing.platforms.includes(platform)) {
            existing.platforms.push(platform);
          }
        });
      } else {
        assetMap.set(key, {
          id: asset.id,
          symbol: asset.symbol,
          name: cleanAssetLabel(asset.symbol, asset.name),
          amount: asset.amount,
          value: asset.value,
          price: asset.price,
          change24h: asset.change24h,
          platforms: platforms.length > 0 ? platforms : [asset.platform],
          type: asset.type,
        });
      }
    });

    return Array.from(assetMap.values());
  }, [assets]);
}
