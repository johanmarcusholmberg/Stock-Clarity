import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@/lib/clerk";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import {
  AuditResponse,
  AuditRow,
  GrantRow,
  OverviewResponse,
  getAudit,
  getSubscriptionOverview,
} from "@/lib/adminApi";
import { UserHeader } from "@/components/admin/UserHeader";
import { ActionsDrawer, AdminAction } from "@/components/admin/ActionsDrawer";
import { GrantsList } from "@/components/admin/GrantsList";
import { AuditLog } from "@/components/admin/AuditLog";
import { GrantDialog } from "@/components/admin/dialogs/GrantDialog";
import { ExtendDialog } from "@/components/admin/dialogs/ExtendDialog";
import { RevokeDialog } from "@/components/admin/dialogs/RevokeDialog";
import { CancelDialog } from "@/components/admin/dialogs/CancelDialog";
import { RefundDialog } from "@/components/admin/dialogs/RefundDialog";

const AUDIT_PAGE_SIZE = 50;

type DialogKey = "grant" | "extend" | "revoke" | "cancel" | "refund";

export default function AdminUserDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { userId: targetUserId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useUser();
  const { isAdmin, subscriptionToolsAllowed } = useSubscription();
  const requesterEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openDialog, setOpenDialog] = useState<DialogKey | null>(null);
  const [grantForAction, setGrantForAction] = useState<GrantRow | null>(null);

  const loadAll = useCallback(async () => {
    if (!targetUserId || !requesterEmail) return;
    setError(null);
    const [ov, au] = await Promise.all([
      getSubscriptionOverview({ requesterEmail }, targetUserId),
      getAudit({ requesterEmail }, targetUserId, { limit: AUDIT_PAGE_SIZE, offset: 0 }),
    ]);
    if (ov.ok) setOverview(ov.data);
    else setError(ov.error);
    if (au.ok) setAudit(au.data);
    else if (ov.ok) setError(au.error); // only overwrite if overview succeeded
  }, [targetUserId, requesterEmail]);

  useEffect(() => {
    (async () => {
      setInitialLoading(true);
      await loadAll();
      setInitialLoading(false);
    })();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const loadMoreAudit = useCallback(async () => {
    if (!audit || auditLoadingMore || !targetUserId || !requesterEmail) return;
    if (audit.audit.length >= audit.total) return;
    setAuditLoadingMore(true);
    const res = await getAudit({ requesterEmail }, targetUserId, {
      limit: AUDIT_PAGE_SIZE,
      offset: audit.audit.length,
    });
    setAuditLoadingMore(false);
    if (res.ok) {
      setAudit({
        ...res.data,
        audit: [...audit.audit, ...res.data.audit] as AuditRow[],
      });
    } else {
      setError(res.error);
    }
  }, [audit, auditLoadingMore, targetUserId, requesterEmail]);

  const handleAction = useCallback((action: AdminAction) => {
    setOpenDialog(action);
  }, []);

  const handleSuccess = useCallback(async () => {
    // Refetch overview + audit so the UI reflects the mutation and its
    // corresponding audit row. Audit pagination resets to offset 0 — any
    // rows loaded before the mutation will re-appear after the fresh page.
    await loadAll();
  }, [loadAll]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
    body: { padding: 16, gap: 12 },
    errorCard: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.destructive + "55",
      backgroundColor: colors.destructive + "18",
      gap: 6,
    },
    errorText: { color: colors.destructive, fontSize: 13, fontFamily: "Inter_500Medium" },
    lockedText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingHorizontal: 24,
    },
  });

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 16 }}>
            Admin Access Only
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!subscriptionToolsAllowed) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>User detail</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name="slash" size={40} color={colors.mutedForeground} />
          <Text style={s.lockedText}>
            The admin-subscription tools aren't enabled for your account yet.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {overview?.user.email ?? "User detail"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {initialLoading ? (
          <ActivityIndicator color={colors.primary} style={{ paddingVertical: 48 }} />
        ) : error && !overview ? (
          <View style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={onRefresh}>
              <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_700Bold" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : overview ? (
          <>
            <UserHeader overview={overview} />
            <ActionsDrawer source={overview.resolvedSource.source} onAction={handleAction} />
            <GrantsList
              grants={overview.activeGrants}
              onExtend={(g) => {
                setGrantForAction(g);
                setOpenDialog("extend");
              }}
              onRevoke={(g) => {
                setGrantForAction(g);
                setOpenDialog("revoke");
              }}
            />
            <AuditLog
              rows={audit?.audit ?? []}
              total={audit?.total ?? 0}
              loading={auditLoadingMore}
              onLoadMore={loadMoreAudit}
            />
          </>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>

      {overview ? (
        <>
          <GrantDialog
            visible={openDialog === "grant"}
            onClose={() => setOpenDialog(null)}
            onSuccess={handleSuccess}
            userId={overview.user.clerkUserId}
            userEmail={overview.user.email}
            requesterEmail={requesterEmail}
          />
          <ExtendDialog
            visible={openDialog === "extend"}
            onClose={() => {
              setOpenDialog(null);
              setGrantForAction(null);
            }}
            onSuccess={handleSuccess}
            grant={grantForAction}
            requesterEmail={requesterEmail}
          />
          <RevokeDialog
            visible={openDialog === "revoke"}
            onClose={() => {
              setOpenDialog(null);
              setGrantForAction(null);
            }}
            onSuccess={handleSuccess}
            grant={grantForAction}
            userEmail={overview.user.email}
            requesterEmail={requesterEmail}
          />
          <CancelDialog
            visible={openDialog === "cancel"}
            onClose={() => setOpenDialog(null)}
            onSuccess={handleSuccess}
            userId={overview.user.clerkUserId}
            userEmail={overview.user.email}
            requesterEmail={requesterEmail}
            source={overview.resolvedSource.source}
          />
          <RefundDialog
            visible={openDialog === "refund"}
            onClose={() => setOpenDialog(null)}
            onSuccess={handleSuccess}
            userId={overview.user.clerkUserId}
            userEmail={overview.user.email}
            requesterEmail={requesterEmail}
            source={overview.resolvedSource.source}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}
