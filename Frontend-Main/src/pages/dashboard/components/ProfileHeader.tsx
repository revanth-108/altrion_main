import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Check, X, Calendar } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, Input } from '../../../components/ui';
import { useAuthStore } from '../../../store';
import { authService } from '../../../services/auth.service';
import { formatDate } from '../../../utils';

const editProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be less than 50 characters'),
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(30, 'Display name must be less than 30 characters')
    .optional()
    .or(z.literal('')),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use format YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  annualIncome: z
    .union([
      z.literal('' as unknown as number),
      z.number().positive('Must be positive'),
    ])
    .optional(),
  incomeSource: z
    .enum(['employment', 'self_employed', 'investment', 'retirement', 'other'])
    .optional()
    .or(z.literal('' as unknown as 'employment')),
});

type EditProfileFormData = z.infer<typeof editProfileSchema>;

export function ProfileHeader() {
  const { user, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      name: user?.name || '',
      displayName: user?.displayName || '',
      dateOfBirth: user?.dateOfBirth || '',
      annualIncome: user?.annualIncome ?? ('' as unknown as number),
      incomeSource: user?.incomeSource || ('' as unknown as 'employment'),
    },
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const capitalizeFirstLetter = (name: string) => {
    return name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const handleEditClick = () => {
    setSaveError(null);
    reset({
      name: user?.name || '',
      displayName: user?.displayName || '',
      dateOfBirth: user?.dateOfBirth || '',
      annualIncome: user?.annualIncome ?? ('' as unknown as number),
      incomeSource: user?.incomeSource || ('' as unknown as 'employment'),
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSaveError(null);
    reset();
  };

  const onSubmit = async (data: EditProfileFormData) => {
    setSaveError(null);
    try {
      const payload: Parameters<typeof authService.updateProfile>[0] = {};
      if (data.name) payload.name = data.name;
      if (data.dateOfBirth) payload.date_of_birth = data.dateOfBirth;
      if (data.annualIncome && data.annualIncome !== ('' as unknown as number)) {
        payload.annual_income = Number(data.annualIncome);
      }
      if (data.incomeSource && data.incomeSource !== ('' as unknown as 'employment')) {
        payload.income_source = data.incomeSource;
      }

      const updatedUser = await authService.updateProfile(payload);
      updateUser({
        ...updatedUser,
        displayName: data.displayName || updatedUser.displayName,
      });
      setIsEditing(false);
    } catch {
      setSaveError('Failed to save profile. Please try again.');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Card variant="bordered" className="border-altrion-500/20">
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.form
            key="editing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-altrion-500/20 flex items-center justify-center">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-altrion-400">
                    {getInitials(user.name)}
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-semibold text-text-primary">Edit Profile</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                {...register('name')}
                error={errors.name?.message}
              />
              <Input
                label="Display Name (optional)"
                {...register('displayName')}
                error={errors.displayName?.message}
              />
              <Input
                label="Date of Birth"
                placeholder="YYYY-MM-DD"
                {...register('dateOfBirth')}
                error={errors.dateOfBirth?.message}
              />
              <Input
                label="Annual Income (USD, optional)"
                type="number"
                placeholder="e.g. 75000"
                {...register('annualIncome', { valueAsNumber: true })}
                error={errors.annualIncome?.message}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text-secondary">Income Source (optional)</label>
                <select
                  {...register('incomeSource')}
                  className="bg-dark-elevated text-text-primary border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-altrion-500"
                >
                  <option value="">— Select —</option>
                  <option value="employment">Employment</option>
                  <option value="self_employed">Self-Employed</option>
                  <option value="investment">Investment</option>
                  <option value="retirement">Retirement</option>
                  <option value="other">Other</option>
                </select>
                {errors.incomeSource && (
                  <span className="text-xs text-red-400">{errors.incomeSource.message}</span>
                )}
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-red-400">{saveError}</p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={handleCancel}>
                <X size={16} />
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                <Check size={16} />
                Save Changes
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="viewing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 sm:gap-6"
          >
            {/* Avatar */}
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-altrion-500/20 flex items-center justify-center flex-shrink-0">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-xl sm:text-3xl font-bold text-altrion-400">
                  {getInitials(user.name)}
                </span>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold text-text-primary truncate">
                {capitalizeFirstLetter(user.displayName || user.name)}
              </h2>
              <p className="text-text-secondary text-xs sm:text-sm truncate">{user.email}</p>
              <div className="flex items-center gap-1.5 mt-1 text-text-muted text-xs sm:text-sm">
                <Calendar size={12} className="flex-shrink-0" />
                <span className="truncate">Since {formatDate(new Date(user.createdAt))}</span>
              </div>
              {user.dateOfBirth && (
                <p className="text-text-muted text-xs mt-0.5">
                  DOB: {user.dateOfBirth}
                  {user.annualIncome ? ` · $${user.annualIncome.toLocaleString()}/yr` : ''}
                </p>
              )}
            </div>

            {/* Edit Button */}
            <Button variant="secondary" size="sm" onClick={handleEditClick} className="flex-shrink-0">
              <Edit2 size={14} />
              <span className="hidden sm:inline">Edit Profile</span>
              <span className="sm:hidden">Edit</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
