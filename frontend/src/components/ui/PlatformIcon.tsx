import { memo } from 'react';
import { PLATFORM_ICONS } from '@/constants';

interface PlatformIconProps {
  platformId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showBackground?: boolean;
}

const sizeMap = {
  sm: {
    container: 'w-8 h-8',
    icon: 16,
    image: 'w-6 h-6',
  },
  md: {
    container: 'w-10 h-10',
    icon: 20,
    image: 'w-8 h-8',
  },
  lg: {
    container: 'w-14 h-14',
    icon: 28,
    image: 'w-10 h-10',
  },
};

export const PlatformIcon = memo(function PlatformIcon({
  platformId,
  size = 'md',
  className = '',
  showBackground = true,
}: PlatformIconProps) {
  const platformConfig = PLATFORM_ICONS[platformId];
  const Icon = platformConfig?.icon;
  const logo = platformConfig?.logo;
  const color = platformConfig?.color || 'bg-gray-500/20 text-gray-400';
  const dimensions = sizeMap[size];

  const containerClasses = showBackground
    ? `${dimensions.container} rounded-lg flex items-center justify-center ${color} ${className}`
    : `${dimensions.container} flex items-center justify-center ${className}`;

  return (
    <div className={containerClasses}>
      {logo ? (
        <img
          src={logo}
          alt={platformId}
          className={`${dimensions.image} object-contain`}
          loading="lazy"
        />
      ) : Icon ? (
        <Icon size={dimensions.icon} />
      ) : (
        <span className="text-lg font-bold">
          {platformId.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
});
