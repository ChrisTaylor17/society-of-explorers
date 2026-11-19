import React from 'react';
export default function Link({ children, href, prefetch: _prefetch, ...props }: React.PropsWithChildren<{ href: string; prefetch?: boolean; [key: string]: unknown }>) {
  return <a {...props} href={href}>{children}</a>;
}
