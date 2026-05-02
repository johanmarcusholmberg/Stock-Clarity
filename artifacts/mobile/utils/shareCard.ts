import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import type { RefObject } from "react";
import type { View } from "react-native";

// Capture an offscreen view as a PNG and trigger the platform share sheet.
//
// We prefer expo-sharing on native because it returns a real UIActivity /
// Android share sheet that handles image attachments correctly. The RN
// Share fallback (text + url only) is used on web where image-share isn't
// supported by either library.
export async function shareViewAsImage(
  ref: RefObject<View | null>,
  fallbackMessage: string,
): Promise<{ shared: boolean; reason?: string }> {
  const node = ref.current;
  if (!node) return { shared: false, reason: "ref-empty" };

  if (Platform.OS === "web") {
    // view-shot has no web implementation; fall back to text share.
    try {
      await Share.share({ message: fallbackMessage });
      return { shared: true };
    } catch {
      return { shared: false, reason: "web-share-cancelled" };
    }
  }

  let uri: string;
  try {
    // result: "tmpfile" gives us a file:// URI that the share sheet can
    // attach as an actual image (vs base64 which native share can't ingest).
    // width is set explicitly so the captured PNG is sharp on retina
    // displays and social feeds regardless of the source view's pt size.
    uri = await captureRef(node, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      width: 1080,
    });
  } catch (err: any) {
    return { shared: false, reason: err?.message || "capture-failed" };
  }

  const available = await Sharing.isAvailableAsync().catch(() => false);
  if (!available) {
    // Last-resort: text-only share.
    try {
      await Share.share({ message: fallbackMessage });
      return { shared: true };
    } catch {
      return { shared: false, reason: "share-unavailable" };
    }
  }

  try {
    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: "Share insight",
    });
    return { shared: true };
  } catch (err: any) {
    return { shared: false, reason: err?.message || "share-cancelled" };
  }
}
