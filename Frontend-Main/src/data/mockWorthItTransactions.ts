export interface WorthItTransaction {
  id: string;
  merchant: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  initial: string;
}

export const mockWorthItTransactions: WorthItTransaction[] = [
  { id: 'wi-1', merchant: 'Uber', description: 'Late ride home', amount: 34.80, category: 'Transport', date: 'Sat, Apr 11', initial: 'U' },
  { id: 'wi-2', merchant: 'Spotify', description: 'Monthly subscription', amount: 9.99, category: 'Entertainment', date: 'Mon, Apr 7', initial: 'S' },
  { id: 'wi-3', merchant: 'Chipotle', description: 'Lunch with team', amount: 18.40, category: 'Food & Drink', date: 'Tue, Apr 8', initial: 'C' },
  { id: 'wi-4', merchant: 'Amazon Prime', description: 'Annual renewal', amount: 14.99, category: 'Shopping', date: 'Wed, Apr 9', initial: 'A' },
  { id: 'wi-5', merchant: 'Starbucks', description: 'Morning coffee', amount: 7.25, category: 'Food & Drink', date: 'Thu, Apr 10', initial: 'S' },
  { id: 'wi-6', merchant: 'Netflix', description: 'Monthly subscription', amount: 15.49, category: 'Entertainment', date: 'Fri, Apr 11', initial: 'N' },
  { id: 'wi-7', merchant: 'Shell Gas', description: 'Fill up', amount: 62.00, category: 'Transport', date: 'Sat, Apr 12', initial: 'S' },
  { id: 'wi-8', merchant: 'Gym Membership', description: 'Monthly fee', amount: 40.00, category: 'Health', date: 'Sun, Apr 13', initial: 'G' },
];
