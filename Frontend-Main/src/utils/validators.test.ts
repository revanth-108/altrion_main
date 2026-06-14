import { describe, it, expect } from 'vitest';
import { getPasswordRequirements } from './validators';

describe('validators', () => {
  describe('getPasswordRequirements', () => {
    it('should return all requirements met for a strong password', () => {
      const requirements = getPasswordRequirements('Password1', 'Password1');
      expect(requirements.every(r => r.met)).toBe(true);
    });

    it('should mark length requirement as not met for short passwords', () => {
      const requirements = getPasswordRequirements('Pass1', 'Pass1');
      const lengthReq = requirements.find(r => r.label.includes('8 characters'));
      expect(lengthReq?.met).toBe(false);
    });

    it('should mark password match as not met when passwords differ', () => {
      const requirements = getPasswordRequirements('Password1', 'Password2');
      const matchReq = requirements.find(r => r.label.includes('match'));
      expect(matchReq?.met).toBe(false);
    });
  });
});
