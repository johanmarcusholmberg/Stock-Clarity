// Web/Replit stub for react-native-purchases.
// Metro aliases the real package to this file when bundling for the web platform
// (see metro.config.js). Native iOS/Android builds keep the real implementation.

export enum LOG_LEVEL {
  VERBOSE = "VERBOSE",
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface PurchasesPackage {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    priceString: string;
    price: number;
    currencyCode: string;
  };
  offeringIdentifier: string;
}

export interface PurchasesEntitlementInfo {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string;
}

export interface CustomerInfo {
  entitlements: {
    active: Record<string, PurchasesEntitlementInfo>;
    all: Record<string, PurchasesEntitlementInfo>;
  };
  activeSubscriptions: string[];
  allPurchasedProductIdentifiers: string[];
  originalAppUserId: string;
  managementURL: string | null;
}

interface PurchasesOffering {
  identifier: string;
  serverDescription: string;
  availablePackages: PurchasesPackage[];
}

interface PurchasesOfferings {
  current: PurchasesOffering | null;
  all: Record<string, PurchasesOffering>;
}

interface MakePurchaseResult {
  customerInfo: CustomerInfo;
  productIdentifier: string;
  transaction: null;
}

function emptyCustomerInfo(): CustomerInfo {
  return {
    entitlements: { active: {}, all: {} },
    activeSubscriptions: [],
    allPurchasedProductIdentifiers: [],
    originalAppUserId: "web-stub",
    managementURL: null,
  };
}

const Purchases = {
  setLogLevel(_level: LOG_LEVEL): void {},

  async configure(_options: { apiKey: string; appUserID?: string }): Promise<void> {},

  async logIn(_userId: string): Promise<{ customerInfo: CustomerInfo; created: boolean }> {
    return { customerInfo: emptyCustomerInfo(), created: false };
  },

  async logOut(): Promise<CustomerInfo> {
    return emptyCustomerInfo();
  },

  async getOfferings(): Promise<PurchasesOfferings> {
    return { current: null, all: {} };
  },

  async purchasePackage(_pkg: PurchasesPackage): Promise<MakePurchaseResult> {
    return {
      customerInfo: emptyCustomerInfo(),
      productIdentifier: "",
      transaction: null,
    };
  },

  async restorePurchases(): Promise<CustomerInfo> {
    return emptyCustomerInfo();
  },

  async getCustomerInfo(): Promise<CustomerInfo> {
    return emptyCustomerInfo();
  },
};

export default Purchases;
