import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, X, Loader2, ArrowRight, Lock, Trophy, Star, Sparkles } from 'lucide-react';
import { Button, Card, Input } from '../../components/ui';
import { ConnectionSetupLayout } from '../../components/layout';
import { PLATFORM_ICONS, ROUTES } from '../../constants';
import { useConnectionStatus } from '../../hooks';
import { useState, useEffect } from 'react';
import { ApiError, platformService } from '../../services';
import { usePlatforms } from '../../hooks/queries/usePlatforms';
import EthereumProvider from '@walletconnect/ethereum-provider';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaidLink } from 'react-plaid-link';
import type { PlatformCredentials } from '@/schemas';
import { ConnectionSuccessNotice } from './ConnectionSuccessNotice';

const CONFETTI_COLORS = [
  '#10b981',
  '#06b6d4',
  '#a855f7',
  '#ec4899',
  '#f59e0b',
];

const CONFETTI_PARTICLES = Array.from({ length: 50 }, () => ({
  left: `${Math.random() * 100}%`,
  color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  x: (Math.random() - 0.5) * 200,
  rotate: Math.random() * 720,
  duration: 2 + Math.random() * 2,
  delay: Math.random() * 0.5,
}));

// Confetti component for celebration moment (peak-end rule)
const Confetti = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
    {CONFETTI_PARTICLES.map((particle, i) => (
      <motion.div
        key={i}
        className="absolute w-2 h-2 rounded-full"
        style={{
          left: particle.left,
          top: -20,
          backgroundColor: particle.color,
        }}
        animate={{
          y: [0, window.innerHeight + 100],
          x: [0, particle.x],
          rotate: [0, particle.rotate],
          opacity: [1, 0],
        }}
        transition={{
          duration: particle.duration,
          delay: particle.delay,
          ease: 'easeOut',
        }}
      />
    ))}
  </div>
);

export function ConnectAPI() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnboarding =
    sessionStorage.getItem('altrion:onboardingFlow') === 'true';
  const selectedPlatformIds = ((location.state?.platforms as string[]) || [])
    .filter((platformId) => platformId === 'plaid');
  const connectionPlatformIds = selectedPlatformIds.length > 0 ? selectedPlatformIds : ['plaid'];
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(
    connectionPlatformIds[0]
  );
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletUri, setWalletUri] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [plaidToken, setPlaidToken] = useState<string | null>(null);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidConnected, setPlaidConnected] = useState(false);
  const queryClient = useQueryClient();
  const { data: platformGroups } = usePlatforms();
  const platforms = platformGroups || { crypto: [], banks: [], brokers: [] };
  const allPlatforms = platforms.banks;

  const connectPlatform = async (
    platformId: string,
    platformCredentials?: Record<string, string>
  ) => {
    const result = await platformService.connectWithCredentials(
      platformId,
      platformCredentials || {}
    );
    if (result.status === 'success') {
      await queryClient.invalidateQueries({ queryKey: ['platforms', 'connected'] });
    }
    return result.status === 'success' ? 'success' : 'error';
  };

  const { connections, successCount, retryConnection } = useConnectionStatus({
    platformIds: connectionPlatformIds,
    autoStart: false,
    connectPlatform,
  });

  const buildCredentials = (): PlatformCredentials | Record<string, string> | null => {
    if (!selectedPlatformId) return null;
    if (!credentials.username) return null;

    if (selectedPlatformId === 'wallet') {
      return {
        address: credentials.username,
        chain: credentials.password || 'ethereum',
      };
    }

    if (!credentials.password) return null;

    return {
      username: credentials.username,
      password: credentials.password,
    };
  };

  const connectWallet = async () => {
    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
    if (!projectId) {
      setWalletError('WalletConnect project ID is not configured.');
      return;
    }

    setWalletConnecting(true);
    setWalletError(null);
    setWalletUri(null);
    setConnectedAddress(null);

    try {
      const provider = await EthereumProvider.init({
        projectId,
        chains: [1],
        optionalChains: [1],
        showQrModal: true,
        methods: ['eth_requestAccounts', 'eth_chainId'],
        events: ['accountsChanged', 'chainChanged'],
        metadata: {
          name: 'Altrion',
          description: 'Altrion wallet connection',
          url: window.location.origin,
          icons: [],
        },
      });

      provider.on('display_uri', (uri: string) => {
        setWalletUri(uri);
      });

      await provider.connect();

      const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
      const chainIdHex = await provider.request<string>({ method: 'eth_chainId' });

      const address = accounts?.[0];
      const chain = chainIdHex ? parseInt(chainIdHex, 16).toString() : '1';

      if (!address) {
        setWalletError('No wallet address returned from WalletConnect.');
        return;
      }

      setConnectedAddress(address);

      const connectionIndex = connections.findIndex(c => c.platformId === selectedPlatformId);
      if (connectionIndex === -1) {
        setWalletError('Wallet connection target not found.');
        return;
      }

      retryConnection(connectionIndex, { address, chain });
    } catch (error) {
      console.error('WalletConnect failed', error);
      setWalletError('Wallet connection failed. Please try again.');
    } finally {
      setWalletConnecting(false);
    }
  };

  const selectedPlatform = allPlatforms.find(p => p.id === selectedPlatformId);
  const isWallet = selectedPlatformId === 'wallet';
  const isPlaid = selectedPlatformId === 'plaid';
  const isOAuthReturn = window.location.href.includes('oauth_state_id');

  useEffect(() => {
    const fetchPlaidToken = async () => {
      if (!isPlaid && !isOAuthReturn) return;
      if (isOAuthReturn) {
        const cachedToken = localStorage.getItem('plaid_link_token');
        if (cachedToken) {
          setPlaidToken(cachedToken);
          return;
        }
      }
      try {
        setPlaidError(null);
        const token = await platformService.getPlaidLinkToken();
        localStorage.setItem('plaid_link_token', token);
        setPlaidToken(token);
      } catch (error) {
        console.error('Failed to get Plaid link token', error);
        setPlaidError('Failed to initialize bank connection. Please try again.');
      }
    };
    fetchPlaidToken();
  }, [isPlaid, isOAuthReturn]);

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: plaidToken || '',
    receivedRedirectUri: isOAuthReturn ? window.location.href : undefined,
    onSuccess: async (public_token: string) => {
      try {
        const result = await platformService.exchangePlaidToken(public_token);
        if (!result.success) {
          setPlaidError('Bank connection failed. Please try again.');
        } else if (result.persisted === false) {
          setPlaidError('Bank connected, but data storage consent is not enabled yet. Please complete onboarding terms or update your profile consent.');
        } else {
          // Refresh connected platforms list
          await queryClient.invalidateQueries({
            queryKey: ['platforms', 'connected'],
          });
          await queryClient.invalidateQueries({ queryKey: ['plaid'] });
          await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
          localStorage.removeItem('plaid_link_token');
          setPlaidConnected(true);
        }
      } catch (error) {
        console.error('Plaid token exchange failed', error);
        if (error instanceof ApiError && error.status === 403) {
          setPlaidError(error.message || 'Data storage consent is required before connecting financial accounts.');
        } else {
          setPlaidError('Bank connection failed. Please try again.');
        }
      }
    },
    onExit: () => {},
  });

  const handleConnectAccount = () => {
    // Only connect if credentials are provided
    const platformCredentials = buildCredentials();
    if (platformCredentials && selectedPlatformId) {
      const connectionIndex = connections.findIndex(c => c.platformId === selectedPlatformId);
      if (connectionIndex !== -1) {
        retryConnection(connectionIndex, platformCredentials);
      }
    }
  };

  const handlePrimaryClick = () => {
    if (isWallet) {
      void connectWallet();
      return;
    }
    if (isPlaid) {
      openPlaid();
      return;
    }
    handleConnectAccount();
  };

  // Check if all connections are either success or error (completed)
  const allConnectionsCompleted = connections.length > 0 &&
    connections.every(c => c.status === 'success' || c.status === 'error');

  // Show confetti only if at least one account was connected successfully
  const showCelebration = allConnectionsCompleted && successCount > 0;
  const connectionSucceeded = plaidConnected || showCelebration;
  const successDestination = isOnboarding
    ? ROUTES.CONNECT_CRYPTO
    : ROUTES.DASHBOARD;
  const successDestinationLabel = isOnboarding
    ? 'the next setup step'
    : 'your dashboard';

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

  // Auto-navigate to crypto upload step when all connections completed but none successful
  useEffect(() => {
    if (allConnectionsCompleted && successCount === 0) {
      const timer = setTimeout(() => {
        navigate(ROUTES.CONNECT_CRYPTO);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [allConnectionsCompleted, successCount, navigate]);

  // Keep the success confirmation visible briefly before continuing.
  useEffect(() => {
    if (connectionSucceeded) {
      const timer = setTimeout(() => {
        navigate(successDestination, { replace: true });
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [connectionSucceeded, navigate, successDestination]);

  useEffect(() => {
    if (isOAuthReturn && plaidReady) {
      openPlaid();
    }
  }, [isOAuthReturn, plaidReady, openPlaid]);

  return (
    <ConnectionSetupLayout
      backTo={ROUTES.CONNECT_SELECT}
      backLabel="Back to account options"
    >
      <div>
        {plaidConnected && (
          <div className="mb-6">
            <ConnectionSuccessNotice
              title="Bank account connected"
              message="Your account was added securely and your financial data is ready to sync."
              destinationLabel={successDestinationLabel}
            />
          </div>
        )}

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
                      className={`w-full p-3 rounded-lg border-2 transition-all flex items-center gap-3 text-left ${isSelected
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
                        <p className="text-text-secondary text-sm">
                          {isWallet ? 'Connect using WalletConnect' : isPlaid ? 'Connect your bank account securely' : 'Enter your credentials'}
                        </p>
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
                    {!isWallet && !isPlaid && (
                      <div className="space-y-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-2">
                            Email or Username
                          </label>
                          <Input
                            type="text"
                            placeholder="your@email.com or username"
                            value={credentials.username}
                            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-2">
                            Password
                          </label>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            value={credentials.password}
                            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

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
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex-1">
                          <Button
                            size="lg"
                            onClick={handlePrimaryClick}
                            disabled={isWallet ? walletConnecting : isPlaid ? !plaidReady : (!credentials.username || !credentials.password)}
                          >
                            {isWallet ? (
                              walletConnecting ? (
                                <>
                                  <Loader2 size={18} className="animate-spin" />
                                  Connecting...
                                </>
                              ) : (
                                'Connect Wallet'
                              )
                            ) : isPlaid ? (
                              'Connect Bank'
                            ) : (
                              (() => {
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
                              })()
                            )}
                          </Button>
                        </div>
                        {isOnboarding && isPlaid && (
                          <Button
                            variant="secondary"
                            size="lg"
                            onClick={() => navigate(ROUTES.CONNECT_CRYPTO)}
                          >
                            Skip bank connection
                            <ArrowRight size={18} />
                          </Button>
                        )}
                        {!isWallet && !isPlaid && (() => {
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
                      {walletError && (
                        <p className="text-sm text-red-400">{walletError}</p>
                      )}
                      {plaidError && (
                        <p className="text-sm text-red-400">{plaidError}</p>
                      )}
                      {connectedAddress && (
                        <div className="text-xs text-text-muted">
                          Connected wallet: <span className="text-text-primary">{connectedAddress}</span>
                        </div>
                      )}
                      {walletUri && (
                        <div className="text-xs text-text-muted">
                          If your wallet scanner says “no usable data”, open your wallet app’s
                          WalletConnect scanner and scan the QR (do not use the phone camera).
                          <div className="mt-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                window.location.href = walletUri;
                              }}
                            >
                              Open in Wallet
                            </Button>
                          </div>
                        </div>
                      )}
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
                  className="font-display text-2xl sm:text-4xl font-bold text-text-primary mb-3 tracking-tight"
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
                  <Button size="lg" onClick={() => navigate(successDestination, { replace: true })}>
                    {isOnboarding ? 'Continue to PDF import' : 'Open dashboard'}
                    <ArrowRight size={18} />
                  </Button>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </ConnectionSetupLayout>
  );
}
