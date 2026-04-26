import React from 'react';
import { PrivyProvider as BasePrivyProvider } from '@privy-io/expo';

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? 'cmofdpvdb00h40cl7qftz9343';
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '';

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      config={{
        embedded: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
