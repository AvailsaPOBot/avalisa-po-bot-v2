// Public Whop products are intentionally version-controlled: an environment
// override can silently send every buyer to a deleted checkout.
export const WHOP_BASIC_CHECKOUT_URL = 'https://whop.com/avalisabot/products/basic-e9-52a3/';
export const WHOP_PRO_CHECKOUT_URL = 'https://whop.com/avalisabot/products/pro-9d-c997/';

export function appendCheckoutEmail(checkoutUrl, email) {
  if (!email) return checkoutUrl;

  const separator = checkoutUrl.includes('?') ? '&' : '?';
  return `${checkoutUrl}${separator}checkout[email]=${encodeURIComponent(email)}`;
}
