import type { EntryFields } from '@vaultline/contracts';

export const DEMO_PASSPHRASE = 'vaultline demo workspace';
// Fictional credentials, encrypted in memory. No demo account is created on the server.
export const demoEntries: EntryFields[] = [
  {
    title: 'GitHub',
    website: 'https://github.com',
    username: 'alex@example.com',
    password: 'Example-Only!8VqzL9@rN4',
    notes: 'Personal development account. This is a fictional demo credential.',
    favorite: true,
    category: 'login',
  },
  {
    title: 'Figma',
    website: 'https://figma.com',
    username: 'alex@example.com',
    password: 'Demo-Only#7mK2pW9xQ!',
    notes: 'A little space for big ideas.',
    favorite: true,
    category: 'login',
  },
  {
    title: 'Google',
    website: 'https://accounts.google.com',
    username: 'alex@example.com',
    password: 'Example-Only!6dT9hB3qN5',
    notes: '',
    favorite: false,
    category: 'login',
  },
  {
    title: 'Linear',
    website: 'https://linear.app',
    username: 'alex@example.com',
    password: 'Demo-Only@2wE8sU6jK4',
    notes: 'Project planning workspace.',
    favorite: true,
    category: 'login',
  },
  {
    title: 'Notion',
    website: 'https://notion.so',
    username: 'alex@example.com',
    password: 'Demo-Only!9pA5zR7hT2',
    notes: '',
    favorite: false,
    category: 'login',
  },
  {
    title: 'Vercel',
    website: 'https://vercel.com',
    username: 'alex@example.com',
    password: 'Example-Only$3nD8fG5bL7',
    notes: '',
    favorite: false,
    category: 'login',
  },
  {
    title: 'Wi-Fi at home',
    website: '',
    username: '',
    password: '',
    notes:
      'Network: Example Home\nPassphrase: fictional-demo-network\nThis note is encrypted along with every other vault field.',
    favorite: false,
    category: 'note',
  },
  {
    title: 'Travel essentials',
    website: '',
    username: '',
    password: '',
    notes:
      'A private place for useful information. Use fictional information in this portfolio prototype.',
    favorite: false,
    category: 'note',
  },
];
