// if there is no dedicated backend URL, then we assume that the default NGINX proxy is used
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || '/api';
const ENV = process.env.NEXT_PUBLIC_ENV! || 'development'; // investigate
const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY!;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST! || 'https://app.posthog.com';
const STRIPE_PRODUCT_PRO = process.env.NEXT_PUBLIC_STRIPE_PRODUCT_PRO!;
const STRIPE_PRODUCT_STARTER = process.env.NEXT_PUBLIC_STRIPE_PRODUCT_STARTER!;

export {
  BACKEND_API_URL,
  ENV,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  STRIPE_PRODUCT_PRO,
  STRIPE_PRODUCT_STARTER
};
