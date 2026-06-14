import { memo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Wallet, ChevronDown, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui';
import { PLATFORM_ICONS, ROUTES } from '@/constants';
import type { Platform } from '@/types';

interface AccountsDropdownProps {
  connectedAccounts: Platform[];
}

export const AccountsDropdown = memo(function AccountsDropdown({
  connectedAccounts,
}: AccountsDropdownProps) {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button onClick={() => setOpen(!open)} variant="primary">
        <Wallet size={18} />
        Accounts
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-dark-card border border-dark-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {connectedAccounts.length > 0 ? (
              <div className="p-2 border-b border-dark-border">
                <p className="text-xs text-text-muted px-2 py-1 uppercase tracking-wider">Connected Accounts</p>
                {connectedAccounts.map((platform) => {
                  if (!platform) return null;
                  const config = PLATFORM_ICONS[platform.id];
                  const Icon = config?.icon;
                  const logo = config?.logo;
                  const color = config?.color || 'bg-gray-500/20';

                  return (
                    <div
                      key={platform.id}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-dark-elevated transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                        {logo ? (
                          <img src={logo} alt={platform.name} className="w-5 h-5 object-contain" />
                        ) : Icon ? (
                          <Icon size={16} />
                        ) : null}
                      </div>
                      <span className="text-sm text-text-primary flex-1">{platform.name}</span>
                      <Check size={14} className="text-green-500" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center border-b border-dark-border">
                <p className="text-sm text-text-muted">No accounts connected yet</p>
              </div>
            )}

            <div className="p-2">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate(ROUTES.CONNECT_SELECT);
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-dark-elevated transition-colors text-altrion-400"
              >
                <div className="w-8 h-8 rounded-lg bg-altrion-500/20 flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <span className="text-sm font-medium">Add Account</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
