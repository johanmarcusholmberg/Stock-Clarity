// Native root route — Metro picks this file for iOS/Android.
// Web root continues to resolve to app/index.web.tsx.
//
// On native there is no marketing landing page; we redirect immediately
// based on auth state so the user lands on the right screen.

import { registerRootComponent } from "expo";
import React, { useEffect } from "react";
import { useAuth } from "@/lib/clerk";
import { useRouter } from "expo-router";

function NativeRoot() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(auth)/sign-in");
    }
  }, [isLoaded, isSignedIn]);

  return null;
}

registerRootComponent(NativeRoot);
export default NativeRoot;
