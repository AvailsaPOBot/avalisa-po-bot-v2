/**
 * Avalisa PO Bot v2 - Shared configuration
 * Loaded before content.js by manifest order.
 */

const API_BASE = 'https://avalisa-backend.onrender.com';
const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisabot.vercel.app';

const TF_TO_SECONDS = { S30: 30, M1: 60, M3: 180, M5: 300, M30: 1800, H1: 3600 };
const SECONDS_TO_TF = Object.fromEntries(Object.entries(TF_TO_SECONDS).map(([tf, sec]) => [sec, tf]));
const AI_SCAN_MAX_FAVORITES = 6;
