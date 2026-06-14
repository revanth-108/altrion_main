export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) {
    return 'No change';
  }

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatLastSyncedAt(lastSyncedAt?: string | null, now = new Date()): string {
  if (!lastSyncedAt) {
    return 'Last synced recently';
  }

  const timestamp = new Date(lastSyncedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Last synced recently';
  }

  const diffMs = Math.max(0, now.getTime() - timestamp.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return 'Last synced just now';
  }

  if (diffMinutes < 60) {
    return `Last synced ${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Last synced ${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }

  return `Last synced ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)}`;
}

export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}k`;
  }
  return value.toString();
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatDisplayName(name: string): string {
  if (!name.trim()) {
    return 'Sandbox01';
  }

  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part) && /\d/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export function getDashboardGreeting(name: string, now = new Date()): string {
  const hour = now.getHours();
  const normalizedName = formatDisplayName(name);

  if (hour < 12) {
    return `Good morning, ${normalizedName}`;
  }
  if (hour < 18) {
    return `Good afternoon, ${normalizedName}`;
  }
  return `Good evening, ${normalizedName}`;
}

export function formatLastPlaidSyncAt(lastPlaidSyncAt?: string | null, now = new Date()): string {
  if (!lastPlaidSyncAt) {
    return 'Not synced yet';
  }

  const timestamp = new Date(lastPlaidSyncAt);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Not synced yet';
  }

  const diffMs = now.getTime() - timestamp.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return 'Last synced just now';
  }

  if (diffMinutes < 60) {
    return `Last synced ${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Last synced ${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }

  return `Last synced ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)}`;
}
