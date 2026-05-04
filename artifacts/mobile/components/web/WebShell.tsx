// Root layout wrapper for Platform.OS === 'web' only.
// Renders a fixed left sidebar (or top navbar + slide-in drawer on mobile
// web) and a centered content panel below the navbar / right of the bar.

import { router, usePathname } from "expo-router";
import { useUser } from "@/lib/clerk";
import React, { useState, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import { useHoldings } from "@/context/HoldingsContext";
import { useWebKeyboard } from "@/hooks/useWebKeyboard";
import { Logo } from "@/components/icons/Logo";
import {
  HomeIcon,
  DigestIcon,
  SearchIcon,
  InsightsIcon,
  PortfolioIcon,
  AlertIcon,
  AccountIcon,
  AdminIcon,
  MenuIcon,
} from "@/components/icons/StockIcons";
import { WebTokens } from "@/components/web/WebTokens";

interface NavItem {
  key: string;
  label: string;
  href: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactElement;
  show: boolean;
}

function useNavItems(): NavItem[] {
  const { tier, isAdmin } = useSubscription();
  const { enabled: holdingsEnabled } = useHoldings();
  return useMemo(
    () => [
      { key: "home", label: "Home", href: "/(tabs)", Icon: HomeIcon, show: true },
      { key: "digest", label: "Digest", href: "/(tabs)/digest", Icon: DigestIcon, show: true },
      { key: "search", label: "Search", href: "/(tabs)/search", Icon: SearchIcon, show: true },
      { key: "insights", label: "Insights", href: "/(tabs)/insights", Icon: InsightsIcon, show: true },
      { key: "portfolio", label: "Portfolio", href: "/(tabs)/portfolio", Icon: PortfolioIcon, show: holdingsEnabled },
      { key: "alerts", label: "Alerts", href: "/(tabs)/alerts", Icon: AlertIcon, show: true },
      { key: "account", label: "Account", href: "/(tabs)/account", Icon: AccountIcon, show: true },
      { key: "admin", label: "Admin", href: "/(tabs)/admin-panel", Icon: AdminIcon, show: isAdmin },
    ],
    [holdingsEnabled, isAdmin, tier],
  );
}

function isActiveRoute(pathname: string, href: string): boolean {
  // expo-router pathnames don't include the (tabs) group prefix
  const target = href.replace(/^\/\(tabs\)/, "") || "/";
  if (target === "/") return pathname === "/" || pathname === "/index";
  return pathname === target || pathname.startsWith(target + "/");
}

function TierBadge({ tier }: { tier: "free" | "pro" | "premium" }) {
  const palette = WebTokens.tierBadge[tier];
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: palette.bg,
      }}
    >
      <Text
        style={{
          color: palette.text,
          fontSize: 10,
          fontFamily: WebTokens.fontBody,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {tier}
      </Text>
    </View>
  );
}

function AvatarCircle({ initials, size = 32 }: { initials: string; size?: number }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.primary,
        // @ts-ignore — web-only style
        backgroundImage: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
      }}
    >
      <Text
        style={{
          color: colors.primaryForeground,
          fontFamily: WebTokens.fontBody,
          fontWeight: "600",
          fontSize: size * 0.42,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}

function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const colors = useColors();
  const [hovered, setHovered] = useState(false);
  const indicatorColor = active ? colors.primary : hovered ? colors.text : colors.mutedForeground;

  return (
    <Pressable
      onPress={onNavigate}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      // @ts-ignore — DOM attribute used for collapsed sidebar tooltip
      dataSet={collapsed ? { sidebarCollapsedTip: item.label } : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: collapsed ? 0 : 14,
        paddingVertical: 10,
        marginVertical: 2,
        marginHorizontal: collapsed ? 8 : 10,
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: active ? colors.primary : "transparent",
        backgroundColor: active ? `${colors.primary}10` : hovered ? colors.muted : "transparent",
        justifyContent: collapsed ? "center" : "flex-start",
        position: "relative",
        // @ts-ignore — web-only
        transition: WebTokens.transition.base,
        cursor: "pointer",
      }}
    >
      <item.Icon size={20} color={indicatorColor} />
      {!collapsed ? (
        <Text
          style={{
            fontFamily: WebTokens.fontBody,
            fontSize: 13,
            fontWeight: active ? "600" : "400",
            color: indicatorColor,
          }}
        >
          {item.label}
        </Text>
      ) : null}
    </Pressable>
  );
}

interface SidebarContentProps {
  collapsed: boolean;
  onNavigate: () => void;
}

function SidebarContent({ collapsed, onNavigate }: SidebarContentProps) {
  const colors = useColors();
  const pathname = usePathname();
  const items = useNavItems().filter((i) => i.show);
  const { user } = useUser();
  const { tier } = useSubscription();

  const initials = useMemo(() => {
    const name =
      user?.fullName ||
      user?.username ||
      user?.primaryEmailAddress?.emailAddress ||
      "?";
    return name
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  }, [user]);

  const displayName = user?.fullName || user?.username || "Welcome";

  return (
    <View style={{ flex: 1, paddingVertical: 18 }}>
      <View style={{ paddingHorizontal: collapsed ? 12 : 18, marginBottom: 6 }}>
        <Logo size={collapsed ? 28 : 28} showWordmark={!collapsed} />
        {!collapsed ? (
          <Text
            style={{
              marginTop: 8,
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.06 * 16,
            }}
          >
            Clarity for your portfolio
          </Text>
        ) : null}
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14, marginHorizontal: collapsed ? 8 : 14 }} />

      <View style={{ flex: 1 }}>
        {items.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            collapsed={collapsed}
            active={isActiveRoute(pathname, item.href)}
            onNavigate={() => {
              router.push(item.href as any);
              onNavigate();
            }}
          />
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: collapsed ? 8 : 14, marginVertical: 12 }} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: collapsed ? 0 : 16,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <AvatarCircle initials={initials} size={collapsed ? 30 : 32} />
        {!collapsed ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontBody,
                fontSize: 13,
                fontWeight: "500",
              }}
            >
              {displayName}
            </Text>
            <View style={{ marginTop: 4, alignSelf: "flex-start" }}>
              <TierBadge tier={tier} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

interface DrawerProps {
  visible: boolean;
  onClose: () => void;
}

function Drawer({ visible, onClose }: DrawerProps) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <View
      // @ts-ignore — fixed positioning is web-only and required for the overlay
      style={{ position: "fixed", inset: 0, zIndex: 100 }}
    >
      <Pressable
        onPress={onClose}
        style={{
          // @ts-ignore
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(0,0,0,0.3)",
        }}
      />
      <View
        style={{
          // @ts-ignore
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 280,
          backgroundColor: colors.card,
          borderRightWidth: 1,
          borderRightColor: colors.border,
          // @ts-ignore
          transition: WebTokens.transition.slow,
          // @ts-ignore
          boxShadow: WebTokens.shadow.lg,
        }}
      >
        <SidebarContent collapsed={false} onNavigate={onClose} />
      </View>
    </View>
  );
}

function TopNavbar({ onMenu }: { onMenu: () => void }) {
  const colors = useColors();
  const { user } = useUser();
  const initials = useMemo(() => {
    const name =
      user?.fullName ||
      user?.username ||
      user?.primaryEmailAddress?.emailAddress ||
      "?";
    return name
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  }, [user]);

  return (
    <View
      // @ts-ignore — fixed positioning is web-only
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: WebTokens.topbarHeight,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        zIndex: 50,
      }}
    >
      <TouchableOpacity onPress={onMenu} accessibilityLabel="Open menu" hitSlop={10}>
        <MenuIcon size={20} color={colors.text} />
      </TouchableOpacity>
      <Logo size={24} showWordmark />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.push("/(tabs)/search" as any)} accessibilityLabel="Search" hitSlop={10}>
          <SearchIcon size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(tabs)/account" as any)} accessibilityLabel="Account">
          <AvatarCircle initials={initials} size={28} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface WebShellProps {
  children: React.ReactNode;
}

export function WebShell({ children }: WebShellProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useWebKeyboard({ onEscape: () => setDrawerOpen(false) });

  const desktopFull = width >= WebTokens.sidebar.breakpointDesktop;
  const desktopCollapsed = width >= WebTokens.sidebar.breakpointTablet && width < WebTokens.sidebar.breakpointDesktop;
  const mobile = width < WebTokens.sidebar.breakpointTablet;

  const sidebarWidth = desktopFull
    ? WebTokens.sidebar.width
    : desktopCollapsed
      ? WebTokens.sidebar.collapsedWidth
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, minHeight: "100%" }}>
      {!mobile ? (
        <View
          // @ts-ignore — fixed positioning is web-only
          style={{
            position: "fixed",
            top: 0,
            bottom: 0,
            left: 0,
            width: sidebarWidth,
            backgroundColor: colors.card,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            zIndex: 40,
          }}
        >
          <SidebarContent collapsed={desktopCollapsed} onNavigate={() => {}} />
        </View>
      ) : (
        <>
          <TopNavbar onMenu={() => setDrawerOpen(true)} />
          <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={
          {
            // 100vh keeps the empty state filling the viewport on the web; not a
            // valid RN type so cast to any.
            minHeight: "100vh",
            paddingTop: mobile ? WebTokens.topbarHeight + 16 : 28,
            paddingBottom: 40,
            paddingLeft: sidebarWidth + (mobile ? 16 : 32),
            paddingRight: mobile ? 16 : 32,
          } as any
        }
      >
        <View
          style={
            { width: "100%", maxWidth: WebTokens.contentMaxWidth, marginHorizontal: "auto" } as any
          }
        >
          {children}
        </View>
      </ScrollView>
    </View>
  );
}
