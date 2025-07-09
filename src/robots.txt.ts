import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const body = `User-agent: *
Disallow: /submit-quote
Disallow: /terms-of-service
Disallow: /schedule
Disallow: /privacy-policy
Disallow: /a11y

Sitemap: ${import.meta.env.SITE || 'https://www.moderndegreeservices.com'}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
