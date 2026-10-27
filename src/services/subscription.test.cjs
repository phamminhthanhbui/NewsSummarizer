const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_test_public_key';
process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT = 'plus';

let currentUser = 'anonymous';
let hasPurchase = false;
const product = {
  identifier: '$rc_monthly', packageType: 'MONTHLY',
  product: { title: 'Plus Monthly', description: 'Longer briefing', priceString: '$1.99', subscriptionPeriod: 'P1M' },
};
const info = () => ({
  entitlements: { active: hasPurchase && currentUser !== 'anonymous' ? { plus: { expirationDate: '2026-12-01' } } : {} },
  managementURL: 'https://apps.apple.com/account/subscriptions',
});
const purchases = {
  configure: ({ appUserID }) => { currentUser = appUserID || 'anonymous'; },
  getAppUserID: async () => currentUser,
  logIn: async (id) => { currentUser = id; },
  logOut: async () => { currentUser = 'anonymous'; },
  isAnonymous: async () => currentUser === 'anonymous',
  setEmail: async () => {},
  getCustomerInfo: async () => info(),
  getOfferings: async () => ({ current: { availablePackages: [product] } }),
  purchasePackage: async () => { hasPurchase = true; return { customerInfo: info() }; },
  restorePurchases: async () => info(),
};
const filename = path.join(__dirname, 'subscription.ts');
const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod.require = id => {
  if (id === 'react-native') return { Platform: { OS: 'ios' } };
  if (id === 'expo-constants') return { default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
  if (id === 'react-native-purchases') return { default: purchases };
  return require(id);
};
mod._compile(js, filename);
const svc = mod.exports;

test('paid entitlement requires RevenueCat and is linked to each signed-in user', async () => {
  assert.equal(svc.purchasesAvailable(), true);
  await svc.identifyPurchasesUser('user-1', 'first@example.com');
  assert.equal((await svc.getSubscriptionState()).active, false);
  const plans = await svc.getStorePlans();
  assert.equal(plans[0].price, '$1.99');
  assert.equal(plans[0].period, 'P1M');
  assert.equal((await svc.purchasePlan('$rc_monthly')).active, true);
  assert.equal((await svc.restorePurchases()).active, true);
  assert.equal((await svc.getSubscriptionState()).expirationDate, '2026-12-01');
  hasPurchase = false;
  await svc.identifyPurchasesUser('user-2', 'second@example.com');
  assert.equal((await svc.getSubscriptionState()).active, false);
  await svc.identifyPurchasesUser(null, null);
  assert.equal(currentUser, 'anonymous');
  assert.equal((await svc.getSubscriptionState()).active, false);
});
