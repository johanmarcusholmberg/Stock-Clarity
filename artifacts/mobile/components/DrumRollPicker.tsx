import React, { useRef, useEffect, useCallback } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const ITEM_H = 48;
const VISIBLE = 5;

interface Props {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width?: number;
}

export function DrumRollPicker({ items, selectedIndex, onSelect, width = 88 }: Props) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const snapToIndex = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    if (clamped !== selectedIndex) onSelect(clamped);
    scrollRef.current?.scrollTo({ y: clamped * ITEM_H, animated: true });
  }, [items.length, selectedIndex, onSelect]);

  const handleScrollEnd = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    snapToIndex(Math.round(y / ITEM_H));
  }, [snapToIndex]);

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: "hidden" }}>
      <View
        style={{
          position: "absolute",
          top: ITEM_H * 2,
          left: 4,
          right: 4,
          height: ITEM_H,
          borderTopWidth: 1.5,
          borderBottomWidth: 1.5,
          borderColor: colors.primary + "70",
          backgroundColor: colors.primary + "12",
          zIndex: 10,
          pointerEvents: "none",
        } as any}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      >
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => snapToIndex(i)}
              activeOpacity={0.6}
              style={{ height: ITEM_H, alignItems: "center", justifyContent: "center" }}
            >
              <Text
                style={{
                  fontSize: isSelected ? 24 : 18,
                  fontFamily: isSelected ? "Inter_700Bold" : "Inter_400Regular",
                  color: isSelected ? colors.foreground : colors.foreground + "44",
                  letterSpacing: -0.5,
                }}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
