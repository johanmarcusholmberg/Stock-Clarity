import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PACKAGE_TYPE,
} from "react-native-purchases";
import { Platform } from "react-native";

import { getApiBase } from "../lib/apiBase";
import { authedFetch } from "../lib/authedFetch";
const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

const API_BASE =
  getApiBase();

export async function initPurchases(userId?: string): Promise<void> {
  if (Platform.OS === "web") return;

  const apiKey =
    Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;

  if (!apiKey) {
    console.warn("RevenueCat API key not set — IAP disabled.");
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  await Purchases.configure({ apiKey });

  if (userId) {
    await Purchases.logIn(userId);
  }
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (err) {
    console.error("Failed to fetch offerings:", err);
    return [];
  }
}

/**
 * Resolve a tier + billing period to the matching RevenueCat package.
 *
 * Period safety: `packages` is FIRST filtered down to the requested
 * billing period via RevenueCat's `packageType` (the SDK exposes
 * MONTHLY/ANNUAL constants). Without this filter, a yearly product
 * could be selected when the paywall card says "/mo" — Apple/Google
 * would then charge the yearly amount and we'd be mislabeling.
 *
 * Lookup strategies, applied in order against the period-filtered set:
 *
 *   1. EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP env var, JSON-encoded, e.g.
 *      `{"pro_monthly":"pro","pro_yearly":"pro","premium_monthly":"premium"}`.
 *      Use this when launch product ids don't match the convention.
 *      If this env var is configured for the tier but no mapped id
 *      matches an available package, we FAIL CLOSED (return null)
 *      rather than fall back to convention. Silent fallback would
 *      mask config drift between server and stores.
 *   2. Convention fallback (only if env-map is NOT configured for the
 *      tier): exact match on `<tier>_monthly` / `<tier>_yearly`,
 *      then a substring match guarded against the `pro` ⊂ `premium`
 *      collision.
 *
 * Returns null if no package matches — callers should treat this as a
 * configuration error and surface a "plans unavailable" state rather
 * than silently degrading.
 */
export function findPackageForTier(
  packages: PurchasesPackage[],
  tier: "pro" | "premium",
  period: "month" | "year" = "month",
): PurchasesPackage | null {
  const wantType =
    period === "month" ? PACKAGE_TYPE.MONTHLY : PACKAGE_TYPE.ANNUAL;
  // Period guard: only consider packages whose RC packageType matches
  // the requested billing period. This is the source-of-truth filter;
  // every strategy below operates on the filtered list.
  const filtered = packages.filter((p) => p.packageType === wantType);

  const envMap = process.env.EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP;
  let envMapConfiguredForTier = false;
  if (envMap) {
    try {
      const map = JSON.parse(envMap) as Record<string, string>;
      const productIdsForTier = Object.entries(map)
        .filter(([, t]) => t === tier)
        .map(([pid]) => pid);
      if (productIdsForTier.length > 0) {
        envMapConfiguredForTier = true;
        const exact = filtered.find((p) =>
          productIdsForTier.includes(p.product.identifier),
        );
        if (exact) return exact;
      }
    } catch (err) {
      console.warn(
        "findPackageForTier: EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP is not valid JSON; ignoring.",
        err,
      );
    }
  }

  if (envMapConfiguredForTier) {
    // Env override was set for this tier but no package matched the
    // requested period. Fail closed so the user sees "Pricing
    // unavailable" rather than getting silently routed to a tier the
    // operator did not intend.
    console.warn(
      `findPackageForTier: env-map configured for tier "${tier}" (${period}) but no matching ${period} package in offerings. ` +
        `Available ${period} product ids: ${filtered.map((p) => p.product.identifier).join(", ")}`,
    );
    return null;
  }

  const lcTier = tier.toLowerCase();
  const periodSuffix = period === "month" ? "monthly" : "yearly";
  const exactConvention = filtered.find(
    (p) => p.product.identifier.toLowerCase() === `${lcTier}_${periodSuffix}`,
  );
  if (exactConvention) return exactConvention;

  const fuzzy = filtered.find((p) => {
    const id = p.product.identifier.toLowerCase();
    if (tier === "pro") return id.includes("pro") && !id.includes("premium");
    return id.includes("premium");
  });
  if (fuzzy) return fuzzy;

  console.warn(
    `findPackageForTier: no ${period} RC package found for tier "${tier}". ` +
      `Available ${period} product ids: ${filtered.map((p) => p.product.identifier).join(", ")}`,
  );
  return null;
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (err: any) {
    if (!err.userCancelled) {
      console.error("Purchase error:", err);
    }
    return { success: false, error: err.message };
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.restorePurchases();
  } catch {
    return null;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/** Map RevenueCat entitlement IDs to our internal tier strings */
export function entitlementsToTier(
  customerInfo: CustomerInfo,
): "free" | "pro" | "premium" {
  const active = customerInfo.entitlements.active;
  if (active["premium"]) return "premium";
  if (active["pro"]) return "pro";
  return "free";
}

export async function syncTierToBackend(
  userId: string,
  tier: string,
): Promise<void> {
  try {
    await authedFetch(`${API_BASE}/payment/sync-tier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, tier }),
    });
  } catch (err) {
    console.error("Tier sync failed:", err);
  }
}
