import { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import Providers from './ChakraProvider';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session}>
      <Providers>
        <Component {...pageProps} />
      </Providers>
    </SessionProvider>
  );
}

export default MyApp;
