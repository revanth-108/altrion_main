import { describe, it, expect } from 'vitest';
import { validateEmail, validatePassword, validateName, getPasswordRequirements } from './validators';

describe('validators', () => {
  describe('validateEmail', () => {
    it('should return true for valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('invalid@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('test@domain')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid passwords', () => {
      expect(validatePassword('Password1')).toBe(true);
      expect(validatePassword('MyStr0ngPass')).toBe(true);
      expect(validatePassword('Test1234')).toBe(true);
    });

    it('should return false for passwords without uppercase', () => {
      expect(validatePassword('password1')).toBe(false);
    });

    it('should return false for passwords without numbers', () => {
      expect(validatePassword('Password')).toBe(false);
    });

    it('should return false for passwords shorter than 8 characters', () => {
      expect(validatePassword('Pass1')).toBe(false);
    });
  });

  describe('validateName', () => {
    it('should return true for valid names', () => {
      expect(validateName('John')).toBe(true);
      expect(validateName('Jo')).toBe(true);
      expect(validateName('John Doe')).toBe(true);
    });

    it('should return false for names shorter than 2 characters', () => {
      expect(validateName('J')).toBe(false);
      expect(validateName('')).toBe(false);
      expect(validateName(' ')).toBe(false);
    });
  });

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
