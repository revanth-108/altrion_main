import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import logoImage from '../../assets/logo.png';
import logoIconImage from '../../assets/logo_2.png';
import { ROUTES } from '../../constants';
import { useAuthStore, selectIsAuthenticated } from '../../store';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  variant?: 'full' | 'icon';
  clickable?: boolean;
}

export function Logo({ size = 'md', showText = true, variant = 'full', clickable = true }: LogoProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const sizes = {
    sm: { icon: 40, text: 'text-lg' },
    md: { icon: 56, text: 'text-xl' },
    lg: { icon: 80, text: 'text-3xl' },
  };

  const logoSrc = variant === 'icon' ? logoIconImage : logoImage;

  const handleClick = () => {
    if (clickable) {
      navigate(isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex items-center gap-3 ${clickable ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
    >
      <img
        src={logoSrc}
        alt="Altrion Logo"
        style={{ height: sizes[size].icon, width: 'auto' }}
        className="object-contain"
      />

      {showText && variant === 'full' && (
        <span className={`font-bold ${sizes[size].text} tracking-wide`}>
          <span className="text-text-primary">ALTR</span>
          <span className="text-altrion-400">ION</span>
        </span>
      )}
    </motion.div>
  );
}
