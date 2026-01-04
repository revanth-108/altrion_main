import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="theme-toggle relative w-12 h-12 rounded-lg flex items-center justify-center transition-all bg-dark-card border border-dark-border hover:border-altrion-500/50"
      aria-label="Toggle theme"
    >
      <motion.div
        initial={false}
        animate={{ rotate: theme === 'dark' ? 0 : 180, scale: theme === 'dark' ? 1 : 0.8 }}
        transition={{ duration: 0.3 }}
      >
        {theme === 'dark' ? (
          <Moon size={20} className="text-altrion-400" />
        ) : (
          <Sun size={20} className="text-amber-500" />
        )}
      </motion.div>
    </motion.button>
  );
}
