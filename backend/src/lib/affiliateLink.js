// Single source of truth. PocketPartners supplies ac, cid, and al campaign
// parameters; changing them without its dashboard breaks revenue tracking silently.
const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

module.exports = { AFFILIATE_LINK };

// HOW A CAMPAIGN SWAP REACHES USERS - the split below is deliberate, not accidental.
//
//   EXTENSION  fetches GET /api/config/affiliate-link at runtime (content.js), falling back to
//              its bundled constant. So changing THIS file reaches all installed extensions
//              LIVE - no Web Store release, no review wait. That matters: a store release takes
//              days, and the installed base is the population that earns.
//   DASHBOARD  uses a version-controlled constant (dashboard/src/lib/affiliate.js), the same
//              pattern as checkout.js. It redeploys in about a minute on push, and this project
//              has already paid two months of dead checkout for the alternative: a runtime value
//              silently disagreeing with the code someone read.
//
// So a swap is: edit this file (extensions update themselves) + edit the dashboard constant
// + push. Three files, one per independently-built artifact, all in git and all reviewable.
