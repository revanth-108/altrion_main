import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, X, Loader2, Shield, ArrowRight, Lock, Trophy, Star, Sparkles } from 'lucide-react';
import { Button, Card, Logo, Input, ThemeToggle } from '../../components/ui';
import { walletPlatforms } from '../../mock/data';
import { PLATFORM_ICONS, ROUTES } from '../../constants';
import { useConnectionStatus } from '../../hooks';
import { useState, useEffect } from 'react';

// Confetti component for celebration moment (peak-end rule)
const Confetti = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
    {[...Array(50)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-2 h-2 rounded-full"
        style={{
          left: `${Math.random() * 100}%`,
          top: -20,
          backgroundColor: [
            '#10b981',
            '#06b6d4',
            '#a855f7',
            '#ec4899',
            '#f59e0b',
          ][Math.floor(Math.random() * 5)],
        }}
        animate={{
          y: [0, window.innerHeight + 100],
          x: [0, (Math.random() - 0.5) * 200],
          rotate: [0, Math.random() * 720],
          opacity: [1, 0],
        }}
        transition={{
          duration: 2 + Math.random() * 2,
          delay: Math.random() * 0.5,
          ease: 'easeOut',
        }}
      />
    ))}
  </div>
);

const allPlatforms = [
  ...walletPlatforms.crypto,
  ...walletPlatforms.banks,
  ...walletPlatforms.brokers,
];

export function ConnectAPI() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedPlatformIds = (location.state?.platforms as string[]) || [];
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(
    selectedPlatformIds[0] || null
  );
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  const { connections, allComplete, successCount, retryConnection } = useConnectionStatus({
    platformIds: selectedPlatformIds,
    autoStart: false,
  });

  const handleConnectAccount = () => {
    // Only connect if credentials are provided
    if (credentials.username && credentials.password && selectedPlatformId) {
      const connectionIndex = connections.findIndex(c => c.platformId === selectedPlatformId);
      if (connectionIndex !== -1) {
        retryConnection(connectionIndex);
      }
    }
  };

  const selectedPlatform = allPlatforms.find(p => p.id === selectedPlatformId);

  // Check if all connections are either success or error (completed)
  const allConnectionsCompleted = connections.length > 0 &&
    connections.every(c => c.status === 'success' || c.status === 'error');

  // Show confetti only if at least one account was connected successfully
  const showCelebration = allConnectionsCompleted && successCount > 0;

  // Save connected accounts to localStorage when connections complete
  useEffect(() => {
    if (allConnectionsCompleted) {
      const successfulIds = connections
        .filter(c => c.status === 'success')
        .map(c => c.platformId);

      // Get existing connected accounts and merge with new ones
      const existingAccounts = JSON.parse(localStorage.getItem('altrion-connected-accounts') || '[]');
      const allConnectedAccounts = [...new Set([...existingAccounts, ...successfulIds])];
      localStorage.setItem('altrion-connected-accounts', JSON.stringify(allConnectedAccounts));
    }
  }, [allConnectionsCompleted, connections]);

  // Auto-navigate to dashboard when all connections completed but none successful (no confetti case)
  useEffect(() => {
    if (allConnectionsCompleted && successCount === 0) {
      const timer = setTimeout(() => {
        navigate(ROUTES.DASHBOARD);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [allConnectionsCompleted, successCount, navigate]);

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="p-4 border-b border-dark-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs">
              <Shield size={14} className="text-altrion-400" />
              <span className="text-text-secondary">Secure</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Selected Platforms */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <h2 className="font-display text-xl font-bold text-text-primary mb-4">Your Accounts</h2>
              <div className="space-y-2">
                {connections.map((conn, index) => {
                  const platform = allPlatforms.find(p => p.id === conn.platformId);
                  if (!platform) return null;

                  const isSelected = selectedPlatformId === conn.platformId;
                  const platformConfig = PLATFORM_ICONS[platform.id];
                  const Icon = platformConfig?.icon;
                  const logo = platformConfig?.logo;
                  const color = platformConfig?.color || 'bg-gray-500/20';

                  return (
                    <motion.button
                      key={conn.platformId}
                      onClick={() => setSelectedPlatformId(conn.platformId)}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`w-full p-3 rounded-lg border-2 transition-all flex items-center gap-3 text-left ${
                        isSelected
                          ? 'border-altrion-500 bg-altrion-500/10'
                          : 'border-dark-border bg-dark-card hover:border-dark-border/80'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                        {logo ? (
                          <img src={logo} alt={platform.name} className="w-8 h-8 object-contain" />
                        ) : Icon ? (
                          <Icon size={20} />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary text-sm truncate">{platform.name}</p>
                        <p className="text-xs text-text-secondary">
                          {conn.status === 'pending' && 'Pending'}
                          {conn.status === 'connecting' && 'Connecting...'}
                          {conn.status === 'success' && 'Connected'}
                          {conn.status === 'error' && 'Failed'}
                        </p>
                      </div>
                      {conn.status === 'success' && (
                        <Check size={16} className="text-green-500 flex-shrink-0" />
                      )}
                      {conn.status === 'error' && (
                        <X size={16} className="text-red-500 flex-shrink-0" />
                      )}
                      {conn.status === 'connecting' && (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Loader2 size={16} className="text-altrion-400 flex-shrink-0" />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Content - Login Form or Status */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {selectedPlatform ? (
                <motion.div
                  key={selectedPlatform.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Card variant="bordered" className="p-6">
                    {/* Platform Header */}
                    <div className="flex items-center gap-4 mb-6">
                      {(() => {
                        const platformConfig = PLATFORM_ICONS[selectedPlatform.id];
                        const Icon = platformConfig?.icon;
                        const logo = platformConfig?.logo;
                        const color = platformConfig?.color || 'bg-gray-500/20';
                        return (
                          <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${color}`}>
                            {logo ? (
                              <img src={logo} alt={selectedPlatform.name} className="w-12 h-12 object-contain" />
                            ) : Icon ? (
                              <Icon size={32} />
                            ) : null}
                          </div>
                        );
                      })()}
                      <div>
                        <h3 className="font-display text-2xl font-bold text-text-primary">{selectedPlatform.name}</h3>
                        <p className="text-text-secondary text-sm">Enter your credentials</p>
                      </div>
                    </div>

                    {/* Security Info */}
                    <div className="bg-altrion-500/10 border border-altrion-500/20 rounded-lg p-3 mb-6">
                      <div className="flex gap-2 text-sm">
                        <Lock size={16} className="text-altrion-400 flex-shrink-0 mt-0.5" />
                        <p className="text-text-secondary">
                          Your credentials are encrypted and never stored. We only use read-only access.
                        </p>
                      </div>
                    </div>

                    {/* Login Form */}
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Email or Username</label>
                        <Input
                          type="text"
                          placeholder="your@email.com or username"
                          value={credentials.username}
                          onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Password</label>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          value={credentials.password}
                          onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Connection Status */}
                    {(() => {
                      const conn = connections.find(c => c.platformId === selectedPlatform.id);
                      return (
                        <>
                          {conn?.status === 'success' && (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-6 flex items-center gap-3">
                              <Check size={20} className="text-green-400" />
                              <p className="text-green-400 text-sm font-medium">Connected successfully!</p>
                            </div>
                          )}
                          {conn?.status === 'error' && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6 flex items-center gap-3">
                              <X size={20} className="text-red-400" />
                              <p className="text-red-400 text-sm font-medium">Connection failed. Please try again.</p>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Button
                          size="lg"
                          onClick={handleConnectAccount}
                          disabled={!credentials.username || !credentials.password}
                        >
                          {(() => {
                            const conn = connections.find(c => c.platformId === selectedPlatform.id);
                            if (conn?.status === 'connecting') {
                              return (
                                <>
                                  <Loader2 size={18} className="animate-spin" />
                                  Connecting...
                                </>
                              );
                            }
                            return 'Connect Account';
                          })()}
                        </Button>
                      </div>
                      {(() => {
                        const conn = connections.find(c => c.platformId === selectedPlatform.id);
                        return conn?.status === 'error' ? (
                          <Button
                            variant="secondary"
                            onClick={() => retryConnection(connections.findIndex(c => c.platformId === selectedPlatform.id))}
                          >
                            Retry
                          </Button>
                        ) : null;
                      })()}
                    </div>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center h-96"
                >
                  <p className="text-text-secondary">Select an account from the left to connect</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Progress Section */}
        {!allConnectionsCompleted && (
          <div className="mt-8 pt-6 border-t border-dark-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-text-secondary">
                Progress: <span className="text-text-primary font-bold">{successCount} of {connections.length}</span>
              </p>
            </div>
            <div className="h-2 bg-dark-elevated rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-altrion-500 to-altrion-400"
                initial={{ width: '0%' }}
                animate={{
                  width: `${((connections.filter(c => c.status === 'success' || c.status === 'error').length) / connections.length) * 100}%`,
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Complete State with Confetti - only if at least one account connected */}
        <AnimatePresence>
          {showCelebration && (
            <>
              <Confetti />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 text-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: 360 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="w-24 h-24 bg-gradient-to-br from-altrion-400 to-altrion-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-altrion-500/50"
                >
                  <Trophy className="w-12 h-12 text-text-primary" />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="font-display text-4xl font-bold text-text-primary mb-3 tracking-tight"
                >
                  You're all set{localStorage.getItem('altrion-displayName') ? `, ${localStorage.getItem('altrion-displayName')}` : ''}!
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="text-text-secondary text-lg mb-6"
                >
                  Successfully connected {successCount} of {connections.length} accounts
                </motion.p>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="flex items-center justify-center gap-4 mb-8"
                >
                  <div className="badge badge-success">
                    <Star className="w-4 h-4" />
                    Accounts Connected
                  </div>
                  <div className="badge badge-info">
                    <Sparkles className="w-4 h-4" />
                    Ready to Go
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 }}
                >
                  <Button size="lg" onClick={() => navigate(ROUTES.DASHBOARD)}>
                    Go to Dashboard
                    <ArrowRight size={18} />
                  </Button>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
