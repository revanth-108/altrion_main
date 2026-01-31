import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Wallet, Building, TrendingUp, ArrowRight, Check, Search } from 'lucide-react';
import { Button, Card, Logo, Input, ThemeToggle } from '../../components/ui';
import { usePlatforms } from '../../hooks/queries/usePlatforms';
import { PLATFORM_ICONS, ROUTES } from '../../constants';

type CategoryType = 'crypto' | 'banks' | 'brokers';

const categories = [
  { id: 'crypto' as CategoryType, label: 'Crypto Wallets', icon: Wallet, color: 'text-orange-400' },
  { id: 'banks' as CategoryType, label: 'Bank Accounts', icon: Building, color: 'text-blue-400' },
  { id: 'brokers' as CategoryType, label: 'Brokerages', icon: TrendingUp, color: 'text-green-400' },
];

export function SelectWallets() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<CategoryType>('crypto');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const { data: platformGroups } = usePlatforms();
  const platforms = platformGroups || { crypto: [], banks: [], brokers: [] };
  const allPlatforms = [...platforms.crypto, ...platforms.banks, ...platforms.brokers];

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  const currentPlatforms = platforms[activeCategory].filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleContinue = () => {
    navigate(ROUTES.CONNECT_API, { state: { platforms: selectedPlatforms } });
  };

  const handleSkip = () => {
    navigate(ROUTES.DASHBOARD);
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="p-4 border-b border-dark-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" onClick={handleSkip}>
              Skip for now
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-5">
        {/* Title with Social Proof */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className="font-display text-3xl font-bold text-text-primary mb-2 tracking-tight">
            Connect your accounts
          </h1>
          <p className="text-text-secondary text-sm max-w-md mx-auto mb-3">
            Select the platforms you want to import. We'll securely connect to aggregate your portfolio.
          </p>
          {/* Social proof - reduces decision anxiety */}
          <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
            <div className="flex -space-x-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-altrion-400 to-altrion-600 border-2 border-dark-bg" />
              ))}
            </div>
            <span><span className="text-altrion-400 font-bold">8,500+</span> users connected</span>
          </div>
        </motion.div>

        {/* Category Tabs */}
        <div className="flex gap-2 mb-5 bg-dark-card p-1 rounded-lg">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-dark-elevated text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <cat.icon size={18} className={activeCategory === cat.id ? cat.color : ''} />
              <span className="hidden sm:inline">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-5">
          <Input
            placeholder={`Search ${categories.find(c => c.id === activeCategory)?.label.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={20} />}
          />
        </div>

        {/* Platform Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-12 mb-6"
          >
            {currentPlatforms.map((platform, index) => (
              <motion.button
                key={platform.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => togglePlatform(platform.id)}
                className={`relative w-full aspect-square rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                  selectedPlatforms.includes(platform.id)
                    ? 'border-altrion-500 bg-altrion-500/10'
                    : 'border-dark-border bg-dark-card hover:border-dark-border-hover'
                }`}
              >
                {selectedPlatforms.includes(platform.id) && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 w-5 h-5 bg-altrion-500 rounded-full flex items-center justify-center"
                  >
                    <Check size={12} className="text-white" />
                  </motion.div>
                )}
                {(() => {
                  const platformConfig = PLATFORM_ICONS[platform.id];
                  const Icon = platformConfig?.icon;
                  const logo = platformConfig?.logo;
                  const color = platformConfig?.color || 'bg-gray-500/20 text-gray-400';
                  return (
                    <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${color}`}>
                      {logo ? (
                        <img src={logo} alt={platform.name} className="w-10 h-10 object-contain" />
                      ) : Icon ? (
                        <Icon size={28} />
                      ) : null}
                    </div>
                  );
                })()}
                <span className="font-medium text-text-primary text-center text-sm">{platform.name}</span>
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Selected Summary */}
        <AnimatePresence>
          {selectedPlatforms.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <Card variant="bordered" className="mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-text-secondary text-sm">Selected accounts</p>
                    <p className="text-text-primary font-semibold">
                      <span className="font-bold">{selectedPlatforms.length}</span> platform{selectedPlatforms.length !== 1 ? 's' : ''} ready to connect
                    </p>
                  </div>
                  <div className="flex -space-x-2">
                    {selectedPlatforms.slice(0, 5).map((id) => {
                      const platform = allPlatforms.find(p => p.id === id);
                      const platformConfig = PLATFORM_ICONS[id];
                      const Icon = platformConfig?.icon;
                      const logo = platformConfig?.logo;
                      const color = platformConfig?.color || 'bg-gray-500/20';
                      return (
                        <div
                          key={id}
                          className={`w-10 h-10 rounded-full border-2 border-dark-bg flex items-center justify-center text-lg ${color}`}
                        >
                          {logo ? (
                            <img src={logo} alt={platform?.name} className="w-8 h-8 object-contain" />
                          ) : Icon ? (
                            <Icon size={20} />
                          ) : (
                            platform?.icon
                          )}
                        </div>
                      );
                    })}
                    {selectedPlatforms.length > 5 && (
                      <div className="w-10 h-10 rounded-full bg-dark-elevated border-2 border-dark-bg flex items-center justify-center text-sm text-text-secondary">
                        +{selectedPlatforms.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleContinue}
            disabled={selectedPlatforms.length === 0}
          >
            Continue to Connect
            <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
