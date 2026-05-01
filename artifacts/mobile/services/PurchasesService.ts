import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from "react-native-purchases";
import { Platform } from "react-native";

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8080/api";

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
    await fetch(`${API_BASE}/payment/sync-tier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, tier }),
    });
  } catch (err) {
    console.error("Tier sync failed:", err);
  }
}
