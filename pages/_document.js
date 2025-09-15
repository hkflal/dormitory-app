import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="zh-HK">
      <Head>
        {/* Extension conflict prevention script - must load first */}
        <script src="/extension-blocker.js" />
        
        {/* Meta tags */}
        <meta charSet="utf-8" />
        <meta name="description" content="宿舍管理系統 - 員工與物業管理" />
        
        {/* Prevent extension injection */}
        <meta httpEquiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'none';" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}